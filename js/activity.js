import { collection, doc, getDocs, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
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
