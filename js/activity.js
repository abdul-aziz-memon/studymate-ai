import { collection, deleteDoc, doc, getDocs, query, serverTimestamp, setDoc, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { auth, db } from "./firebase.js";

function getSignedInUser() {
  return getCurrentUser().then((user) => {
    if (!user) {
      throw new Error("Sign in to save activity to your dashboard.");
    }
    return user;
  });
}

export function getCurrentUser() {
  if (!auth) {
    return Promise.reject(new Error("Firebase is not configured, so activity cannot be saved."));
  }
  if (auth.currentUser) {
    return Promise.resolve(auth.currentUser);
  }

  return new Promise((resolve, reject) => {
    let unsubscribe = null;
    let settled = false;
    const cleanup = () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
    unsubscribe = onAuthStateChanged(auth, (user) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(user);
    }, (error) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error);
    });
    if (settled) {
      unsubscribe();
    }
  });
}

export async function saveActivityRecord(activityId, record) {
  if (!db) {
    throw new Error("Firebase is not configured, so activity cannot be saved.");
  }
  const user = await getSignedInUser();
  await setDoc(doc(collection(db, "users", user.uid, "activity"), activityId), {
    ...record,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function loadActivityRecords() {
  if (!db) {
    throw new Error("Firebase is not configured, so activity cannot be loaded.");
  }
  const user = await getSignedInUser();
  const snapshot = await getDocs(collection(db, "users", user.uid, "activity"));
  return snapshot.docs.map((activity) => ({ id: activity.id, ...activity.data() }));
}

export async function deleteChatActivity(conversationId) {
  if (!db) {
    throw new Error("Firebase is not configured, so chat activity cannot be deleted.");
  }
  if (typeof conversationId !== "string" || !conversationId) {
    throw new Error("The conversation to delete is invalid.");
  }

  const user = await getSignedInUser();
  const activityCollection = collection(db, "users", user.uid, "activity");
  const snapshots = await Promise.all([
    getDocs(query(activityCollection, where("conversationId", "==", conversationId))),
    getDocs(query(activityCollection, where("conversationIds", "array-contains", conversationId)))
  ]);
  const matchingRecords = new Map();
  snapshots.forEach((snapshot) => {
    snapshot.docs.forEach((activity) => {
      if (activity.data().type === "chat") {
        matchingRecords.set(activity.id, activity);
      }
    });
  });
  await Promise.all([...matchingRecords.values()].map((activity) => deleteDoc(activity.ref)));
}

export async function loadCoveredTopics() {
  if (!db) {
    throw new Error("Firebase is not configured, so covered topics cannot be loaded.");
  }
  const user = await getCurrentUser();
  if (!user) {
    return [];
  }
  const snapshot = await getDocs(collection(db, "users", user.uid, "topics"));
  return snapshot.docs
    .map((topic) => ({ id: topic.id, ...topic.data() }))
    .filter((topic) => typeof topic.title === "string" && Number.isFinite(topic.coveredAtMs))
    .sort((first, second) => second.coveredAtMs - first.coveredAtMs);
}

export async function updateLeaderboardEntry(displayName, activityRecords, topics) {
  if (!db) {
    throw new Error("Firebase is not configured, so leaderboard scores cannot be saved.");
  }
  if (!Array.isArray(activityRecords) || !Array.isArray(topics)) {
    throw new Error("Leaderboard data is invalid.");
  }

  const user = await getSignedInUser();
  const name = typeof displayName === "string" ? displayName.trim() : "";
  if (!name || name.length > 80) {
    throw new Error("Your display name must be between 1 and 80 characters to appear on the leaderboard.");
  }
  const gameWins = activityRecords.filter((record) => record.type === "game" && record.outcome === "win").length;
  const studySeconds = getStudyTimeSeconds(activityRecords);
  await setDoc(doc(db, "leaderboard", user.uid), {
    displayName: name,
    gameWins,
    topicCount: topics.length,
    studySeconds
  });
}

export function getStudyTimeSeconds(activityRecords) {
  return activityRecords
    .filter((record) => record.type === "chat")
    .reduce((total, record) => {
      const duration = Number.isSafeInteger(record.durationSeconds) && record.durationSeconds >= 0
        ? record.durationSeconds
        : Number.isSafeInteger(record.durationMs) && record.durationMs >= 0
          ? Math.floor(record.durationMs / 1000)
          : 0;
      return Math.min(100000000, total + duration);
    }, 0);
}

export async function loadLeaderboardEntries() {
  if (!db) {
    throw new Error("Firebase is not configured, so leaderboards cannot be loaded.");
  }
  await getSignedInUser();
  const snapshot = await getDocs(collection(db, "leaderboard"));
  return snapshot.docs
    .map((entry) => ({ id: entry.id, ...entry.data() }))
    .filter((entry) => (
      typeof entry.displayName === "string"
      && entry.displayName.trim().length > 0
      && entry.displayName.length <= 80
      && Number.isSafeInteger(entry.gameWins)
      && entry.gameWins >= 0
      && entry.gameWins <= 1000000
      && Number.isSafeInteger(entry.topicCount)
      && entry.topicCount >= 0
      && entry.topicCount <= 1000000
      && (entry.studySeconds === undefined
        || (Number.isSafeInteger(entry.studySeconds) && entry.studySeconds >= 0 && entry.studySeconds <= 100000000))
    ));
}

export async function saveCoveredTopic(topicTitle, expectedUserId) {
  if (!db) {
    throw new Error("Firebase is not configured, so covered topics cannot be saved.");
  }
  const title = typeof topicTitle === "string" ? topicTitle.trim().replace(/\s+/g, " ") : "";
  if (!title || title.length > 100) {
    throw new Error("The topic title is invalid.");
  }

  const user = await getSignedInUser();
  const normalizedTitle = title.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
  if (!normalizedTitle) {
    throw new Error("The topic title is invalid.");
  }
  if (expectedUserId && user.uid !== expectedUserId) {
    throw new Error("Your account changed before the topic could be saved. Try again.");
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalizedTitle));
  const topicId = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  await setDoc(doc(collection(db, "users", user.uid, "topics"), topicId), {
    title,
    coveredAtMs: Date.now()
  }, { merge: true });
}
