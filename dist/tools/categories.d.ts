/**
 * Hardcoded category mapping for uscardforum.com
 * Categories are stable and don't change frequently
 */
export interface CategoryInfo {
    id: number;
    name: string;
    slug: string;
    description?: string;
    parent_category_id?: number;
}
export declare const CATEGORIES: Record<number, CategoryInfo>;
/**
 * Get category by ID
 */
export declare function getCategoryById(id: number): CategoryInfo | undefined;
/**
 * Get category by name (case-insensitive)
 */
export declare function getCategoryByName(name: string): CategoryInfo | undefined;
/**
 * Get all top-level categories (no parent)
 */
export declare function getTopLevelCategories(): CategoryInfo[];
/**
 * Get subcategories of a parent category
 */
export declare function getSubcategories(parentId: number): CategoryInfo[];
/**
 * Get all category IDs
 */
export declare function getAllCategoryIds(): number[];
/**
 * Get category name by ID (returns "Category {id}" if not found)
 */
export declare function getCategoryName(id: number): string;
