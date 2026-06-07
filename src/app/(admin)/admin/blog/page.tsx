"use client";

import { CrudPage } from "@/components/admin/crud-page";
import { ImageUpload } from "@/components/admin/image-upload";
import { BookOpen } from "lucide-react";
import type { BlogPost } from "@/lib/types";

const columns = [
  { key: "title" as const, label: "Title", render: (item: BlogPost) => <span className="font-medium">{item.title}</span> },
  { key: "category" as const, label: "Category" },
  {
    key: "isPublished" as const,
    label: "Status",
    render: (item: BlogPost) => (
      <span className={`text-xs px-2 py-0.5 rounded-full ${item.isPublished ? "bg-accent/10 text-accent" : "bg-muted text-muted-foreground"}`}>
        {item.isPublished ? "Published" : "Draft"}
      </span>
    ),
  },
];

const defaultValues = {
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  coverImage: "",
  author: "Bill Gaylord",
  tags: [],
  category: "",
  isPublished: false,
  publishedAt: "",
  metaTitle: "",
  metaDescription: "",
};

function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export default function AdminBlogPage() {
  return (
    <CrudPage<BlogPost>
      title="Blog Posts"
      collection="blog"
      columns={columns}
      icon={<BookOpen className="h-6 w-6 text-primary" />}
      defaultValues={defaultValues}
      renderForm={(_, onChange, formData) => (
        <>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Title *</label>
            <input
              value={(formData.title as string) || ""}
              onChange={(e) => {
                onChange("title", e.target.value);
                if (!formData.slug) onChange("slug", slugify(e.target.value));
              }}
              className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Slug</label>
              <input value={(formData.slug as string) || ""} onChange={(e) => onChange("slug", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Category</label>
              <select value={(formData.category as string) || ""} onChange={(e) => onChange("category", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="">Select...</option>
                <option value="guides">Guides</option>
                <option value="tips">Tips</option>
                <option value="news">Company News</option>
                <option value="education">Education</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Excerpt</label>
            <textarea value={(formData.excerpt as string) || ""} onChange={(e) => onChange("excerpt", e.target.value)} rows={2} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Content (HTML)</label>
            <textarea value={(formData.content as string) || ""} onChange={(e) => onChange("content", e.target.value)} rows={12} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary font-mono" />
            <p className="text-xs text-muted-foreground">Rich text editor coming soon. For now, use HTML.</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Cover Image</label>
            <ImageUpload value={(formData.coverImage as string) || ""} onChange={(url) => onChange("coverImage", url)} folder="blog" />
          </div>
          <div className="grid sm:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Meta Title (SEO)</label>
              <input value={(formData.metaTitle as string) || ""} onChange={(e) => onChange("metaTitle", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Meta Description (SEO)</label>
              <input value={(formData.metaDescription as string) || ""} onChange={(e) => onChange("metaDescription", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="isPublished" checked={(formData.isPublished as boolean) || false} onChange={(e) => {
              onChange("isPublished", e.target.checked);
              if (e.target.checked && !formData.publishedAt) onChange("publishedAt", new Date().toISOString());
            }} className="h-4 w-4" />
            <label htmlFor="isPublished" className="text-sm font-medium">Published</label>
          </div>
        </>
      )}
    />
  );
}
