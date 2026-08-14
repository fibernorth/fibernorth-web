import { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BookOpen, Calendar } from "lucide-react";
import { getPublishedBlogPosts } from "@/lib/server-data";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Tips, guides, and news about directional drilling, trenchless installations, and underground utilities in Northern Michigan.",
};

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export default async function BlogPage() {
  const posts = await getPublishedBlogPosts();

  return (
    <div className="py-16 sm:py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight">
            <span className="text-primary">Blog</span>
          </h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            Guides, tips, and news about directional drilling and underground
            utility installations.
          </p>
        </div>

        {posts.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-12 text-center">
            <BookOpen className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-muted-foreground">
              Posts coming soon
            </h2>
            <p className="text-sm text-muted-foreground mt-2">
              We&apos;re writing guides to help homeowners and contractors
              understand trenchless technology. Check back soon.
            </p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map((post) => (
              <Link
                key={post.id}
                href={`/blog/${post.slug}`}
                className="bg-card border border-border rounded-lg overflow-hidden group hover:border-primary/50 transition-colors"
              >
                {post.coverImage ? (
                  <div className="relative aspect-video overflow-hidden">
                    <Image
                      src={post.coverImage}
                      alt={post.title}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-300"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    />
                  </div>
                ) : (
                  <div className="aspect-video bg-muted flex items-center justify-center">
                    <BookOpen className="h-8 w-8 text-muted-foreground/30" />
                  </div>
                )}
                <div className="p-5">
                  {post.category && (
                    <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                      {post.category}
                    </span>
                  )}
                  <h2 className="font-bold mt-2 group-hover:text-primary transition-colors">
                    {post.title}
                  </h2>
                  {post.excerpt && (
                    <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                      {post.excerpt}
                    </p>
                  )}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-3">
                    <Calendar className="h-3 w-3" />
                    <span>
                      {formatDate(post.publishedAt || post.createdAt)}
                    </span>
                    {post.author && (
                      <>
                        <span className="text-muted-foreground/50">|</span>
                        <span>{post.author}</span>
                      </>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
