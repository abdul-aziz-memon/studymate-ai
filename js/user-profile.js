import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { updateProfile } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { auth, db } from "./firebase.js";
import { getCurrentUser } from "./activity.js";

export const gradeOptions = Array.from({ length: 12 }, (_, index) => `Grade ${index + 1}`);

export function isCompleteUserProfile(profile) {
  return Boolean(
    profile
    && typeof profile.displayName === "string"
    && profile.displayName.trim().length >= 2
    && profile.displayName.trim().length <= 80
    && gradeOptions.includes(profile.grade)
  );
}

export async function getUserProfile(user) {
  if (!db) {
    throw new Error("Firebase is not configured, so your study profile cannot be loaded.");
  }
  if (!user?.uid) {
    throw new Error("Sign in to load your study profile.");
  }

  const snapshot = await getDoc(doc(db, "users", user.uid));
  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data();
  return {
    displayName: typeof data.displayName === "string" ? data.displayName : "",
    grade: gradeOptions.includes(data.grade) ? data.grade : ""
  };
}

export async function loadCurrentUserProfile() {
  if (!auth) {
    return null;
  }
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }
  return { user, profile: await getUserProfile(user) };
}

export async function saveUserProfile(user, displayName, grade) {
  if (!db) {
    throw new Error("Firebase is not configured, so your study profile cannot be saved.");
  }
  const name = typeof displayName === "string" ? displayName.trim() : "";
  if (!user?.uid || name.length < 2 || name.length > 80 || !gradeOptions.includes(grade)) {
    throw new Error("Enter a display name and choose a grade from 1 to 12.");
  }
  if (!auth?.currentUser || auth.currentUser.uid !== user.uid) {
    throw new Error("Your account changed before the profile could be saved. Please try again.");
  }

  const profile = { displayName: name, grade };
  await updateProfile(user, { displayName: name });
  await setDoc(doc(db, "users", user.uid), {
    ...profile,
    updatedAtMs: Date.now()
  });
  window.dispatchEvent(new CustomEvent("studymate-profile-updated", { detail: profile }));
  return profile;
}
