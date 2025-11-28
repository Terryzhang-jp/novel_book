import type { JSONContent } from "@/types/storage";

export type { JSONContent };

/**
 * Extract all image URLs from document content
 */
export function extractImageUrls(content: JSONContent): string[] {
    const urls: string[] = [];

    function traverse(node: JSONContent) {
        // Check if this is an image node
        if (node.type === "image" && node.attrs?.src) {
            urls.push(node.attrs.src);
        }

        // Recursively traverse children
        if (node.content && Array.isArray(node.content)) {
            for (const child of node.content) {
                traverse(child);
            }
        }
    }

    traverse(content);
    return urls;
}

/**
 * Find images that were deleted (present in old content but not in new content)
 */
export function getDeletedImages(oldUrls: string[], newUrls: string[]): string[] {
    const newUrlSet = new Set(newUrls);
    return oldUrls.filter(url => !newUrlSet.has(url));
}

/**
 * Parse Supabase Storage URL to extract bucket and path
 * Returns null if URL is not a Supabase Storage URL
 */
export function parseSupabaseImagePath(url: string): { bucket: string; path: string } | null {
    try {
        const urlObj = new URL(url);

        // Check if this is a Supabase storage URL
        // Format: https://{project}.supabase.co/storage/v1/object/public/{bucket}/{path}
        if (!urlObj.hostname.includes('supabase.co')) {
            return null;
        }

        const pathParts = urlObj.pathname.split('/');
        const publicIndex = pathParts.indexOf('public');

        if (publicIndex === -1 || publicIndex >= pathParts.length - 2) {
            return null;
        }

        const bucket = pathParts[publicIndex + 1];
        const path = pathParts.slice(publicIndex + 2).join('/');

        return { bucket, path };
    } catch {
        return null;
    }
}
