import { initializeAdminApp } from "@/services/firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import type {
  Project,
  MajorProject,
  BlogPost,
  Testimonial,
  Equipment,
  TeamMember,
  JobPosting,
} from "./types";

function getDb() {
  const app = initializeAdminApp();
  return getFirestore(app);
}

function docToData<T>(doc: FirebaseFirestore.QueryDocumentSnapshot): T {
  return { id: doc.id, ...doc.data() } as T;
}

async function safeQuery<T>(fn: () => Promise<T[]>): Promise<T[]> {
  try {
    return await fn();
  } catch (error) {
    console.warn("Firestore query failed (missing index?), returning empty:", error);
    return [];
  }
}

export async function getPublishedProjects(): Promise<Project[]> {
  return safeQuery(async () => {
    const db = getDb();
    const snap = await db
      .collection("projects")
      .where("isPublished", "==", true)
      .orderBy("sortOrder", "asc")
      .get();
    return snap.docs.map((doc) => docToData<Project>(doc));
  });
}

export async function getPublishedMajorProjects(): Promise<MajorProject[]> {
  return safeQuery(async () => {
    const db = getDb();
    const snap = await db
      .collection("majorProjects")
      .where("isPublished", "==", true)
      .orderBy("sortOrder", "asc")
      .get();
    return snap.docs.map((doc) => docToData<MajorProject>(doc));
  });
}

export async function getPublishedBlogPosts(): Promise<BlogPost[]> {
  return safeQuery(async () => {
    const db = getDb();
    const snap = await db
      .collection("blog")
      .where("isPublished", "==", true)
      .orderBy("publishedAt", "desc")
      .get();
    return snap.docs.map((doc) => docToData<BlogPost>(doc));
  });
}

export async function getBlogPostBySlug(
  slug: string
): Promise<BlogPost | null> {
  try {
    const db = getDb();
    const snap = await db
      .collection("blog")
      .where("slug", "==", slug)
      .where("isPublished", "==", true)
      .limit(1)
      .get();
    if (snap.empty) return null;
    return docToData<BlogPost>(snap.docs[0]);
  } catch (error) {
    console.warn("Firestore query failed:", error);
    return null;
  }
}

export async function getVisibleTestimonials(): Promise<Testimonial[]> {
  return safeQuery(async () => {
    const db = getDb();
    const snap = await db
      .collection("testimonials")
      .where("isVisible", "==", true)
      .orderBy("createdAt", "desc")
      .get();
    return snap.docs.map((doc) => docToData<Testimonial>(doc));
  });
}

export async function getActiveEquipment(): Promise<Equipment[]> {
  return safeQuery(async () => {
    const db = getDb();
    const snap = await db
      .collection("fleet")
      .where("isActive", "==", true)
      .orderBy("sortOrder", "asc")
      .get();
    return snap.docs.map((doc) => docToData<Equipment>(doc));
  });
}

export async function getActiveTeamMembers(): Promise<TeamMember[]> {
  return safeQuery(async () => {
    const db = getDb();
    const snap = await db
      .collection("team")
      .where("isActive", "==", true)
      .orderBy("sortOrder", "asc")
      .get();
    return snap.docs.map((doc) => docToData<TeamMember>(doc));
  });
}

export async function getActiveJobPostings(): Promise<JobPosting[]> {
  return safeQuery(async () => {
    const db = getDb();
    const snap = await db
      .collection("jobPostings")
      .where("isActive", "==", true)
      .orderBy("sortOrder", "asc")
      .get();
    return snap.docs.map((doc) => docToData<JobPosting>(doc));
  });
}

export async function getCollectionCount(
  collectionName: string,
  statusField?: string,
  statusValue?: string
): Promise<number> {
  try {
    const db = getDb();
    let query: FirebaseFirestore.Query = db.collection(collectionName);
    if (statusField && statusValue) {
      query = query.where(statusField, "==", statusValue);
    }
    const snap = await query.count().get();
    return snap.data().count;
  } catch {
    return 0;
  }
}
