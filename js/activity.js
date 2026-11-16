import { collection, doc, getDocs, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { auth, db } from "./firebase.js";

function getSignedInUser() {
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
      if (user) {
        resolve(user);
      } else {
        reject(new Error("Sign in to save activity to your dashboard."));
      }
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
