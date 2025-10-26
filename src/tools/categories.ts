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

export const CATEGORIES: Record<number, CategoryInfo> = {
  12: { id: 12, name: "玩卡", slug: "rewards", description: "信用卡/银行账户/点数里程/信用分数等" },
  5: { id: 5, name: "信用卡", slug: "credit-cards", parent_category_id: 12 },
  6: { id: 6, name: "银行账户", slug: "bank-accounts", parent_category_id: 12 },
  32: { id: 32, name: "信用分数", slug: "credit-score", parent_category_id: 12 },
  56: { id: 56, name: "Refer专区", slug: "special", parent_category_id: 12 },
  
  15: { id: 15, name: "旅行", slug: "travel", description: "常旅客/飞行体验/住宿体验/景点游记攻略等" },
  38: { id: 38, name: "航空常旅客", slug: "airline-programs", parent_category_id: 15 },
  7: { id: 7, name: "酒店常旅客", slug: "hotel-programs", parent_category_id: 15 },
  17: { id: 17, name: "游记攻略", slug: "trip-report", parent_category_id: 15 },
  50: { id: 50, name: "租车", slug: "car-rental", parent_category_id: 15 },
  58: { id: 58, name: "驴友", slug: "travel-friends", parent_category_id: 15 },
  
  9: { id: 9, name: "理财", slug: "investment", description: "股市房产等投资问题" },
  13: { id: 13, name: "股市投资", slug: "stock-market", parent_category_id: 9 },
  14: { id: 14, name: "房地产", slug: "real-estate", parent_category_id: 9 },
  10: { id: 10, name: "税务", slug: "tax", parent_category_id: 9 },
  43: { id: 43, name: "加密货币", slug: "coins", parent_category_id: 9 },
  
  20: { id: 20, name: "败家", slug: "shopping", description: "折扣信息/好物使用体验" },
  26: { id: 26, name: "好物推荐", slug: "good-stuff", parent_category_id: 20 },
  21: { id: 21, name: "购物折扣", slug: "deals", parent_category_id: 20 },
  23: { id: 23, name: "电子产品", slug: "tech", parent_category_id: 20 },
  25: { id: 25, name: "汽车", slug: "", parent_category_id: 20 },
  44: { id: 44, name: "手机卡", slug: "wireless-services", parent_category_id: 20 },
  
  51: { id: 51, name: "生活", slug: "life", description: "美好生活的点点滴滴" },
  22: { id: 22, name: "吃货", slug: "foodie", parent_category_id: 51 },
  47: { id: 47, name: "影音娱乐", slug: "movies", parent_category_id: 51 },
  49: { id: 49, name: "游戏", slug: "games", parent_category_id: 51 },
  55: { id: 55, name: "健康", slug: "health", parent_category_id: 51 },
  52: { id: 52, name: "园艺种菜", slug: "", parent_category_id: 51 },
  37: { id: 37, name: "宠物", slug: "pets", parent_category_id: 51 },
  53: { id: 53, name: "体育", slug: "", parent_category_id: 51 },
  60: { id: 60, name: "育儿", slug: "children", parent_category_id: 51 },
  62: { id: 62, name: "社会新闻", slug: "news-in-the-us", parent_category_id: 51 },
  45: { id: 45, name: "回国or留美", slug: "china-us-comparison", parent_category_id: 51 },
  
  18: { id: 18, name: "法律", slug: "laws", description: "签证/身份/出入境禁令等问题" },
  19: { id: 19, name: "签证与身份（美国）", slug: "visa", parent_category_id: 18 },
  61: { id: 61, name: "签证与身份（美国以外）", slug: "visa-other-countries-and-regions", parent_category_id: 18 },
  27: { id: 27, name: "新政", slug: "orders", parent_category_id: 18 },
  
  28: { id: 28, name: "情感", slug: "feelings", description: "各种情感想要倾诉" },
  29: { id: 29, name: "爱情", slug: "love", parent_category_id: 28 },
  31: { id: 31, name: "鹊桥", slug: "piebridge", parent_category_id: 28 },
  
  33: { id: 33, name: "搬砖", slug: "jobs", description: "找工作/职场/求学/学术圈" },
  34: { id: 34, name: "面经", slug: "interviews", parent_category_id: 33 },
  36: { id: 36, name: "内推", slug: "job-refer", parent_category_id: 33 },
  48: { id: 48, name: "学术", slug: "academics", parent_category_id: 33 },
  54: { id: 54, name: "求学", slug: "study", parent_category_id: 33 },
  
  57: { id: 57, name: "文艺", slug: "literature-and-art", description: "文艺创作" },
  1: { id: 1, name: "闲聊", slug: "", description: "不需要类别或不适合任何其他现有类别的话题" },
  
  // Restricted categories
  68: { id: 68, name: "白金", slug: "", description: "仅白金会员可见" },
  67: { id: 67, name: "钛金", slug: "", description: "仅钛金会员可见" },
  63: { id: 63, name: "性爱", slug: "", description: "性爱话题收容类别" },
  42: { id: 42, name: "吵架", slug: "politics", description: "广义的政治话题" },
  
  // Closed categories
  40: { id: 40, name: "疫情（已关闭）", slug: "covid-19", description: "疫情防控政策讨论" },
  8: { id: 8, name: "回国机票", slug: "flights-home", parent_category_id: 40 },
  39: { id: 39, name: "来美机票", slug: "come-to-usa", parent_category_id: 40 },
  41: { id: 41, name: "核酸与抗体检测", slug: "nucleic-acid-test", parent_category_id: 40 },
  46: { id: 46, name: "疫苗接种", slug: "", parent_category_id: 40 },
  59: { id: 59, name: "隔离", slug: "quarantine", parent_category_id: 40 },
  
  // Additional categories with missing IDs
  3: { id: 3, name: "公告", slug: "announcements", description: "论坛公告" },
  65: { id: 65, name: "测试", slug: "test", description: "测试分类" },
  66: { id: 66, name: "私密", slug: "private", description: "私密分类" },
};

/**
 * Get category by ID
 */
export function getCategoryById(id: number): CategoryInfo | undefined {
  return CATEGORIES[id];
}

/**
 * Get category by name (case-insensitive)
 */
export function getCategoryByName(name: string): CategoryInfo | undefined {
  const normalizedName = name.toLowerCase().trim();
  return Object.values(CATEGORIES).find(
    cat => cat.name.toLowerCase() === normalizedName
  );
}

/**
 * Get all top-level categories (no parent)
 */
export function getTopLevelCategories(): CategoryInfo[] {
  return Object.values(CATEGORIES).filter(cat => !cat.parent_category_id);
}

/**
 * Get subcategories of a parent category
 */
export function getSubcategories(parentId: number): CategoryInfo[] {
  return Object.values(CATEGORIES).filter(
    cat => cat.parent_category_id === parentId
  );
}

/**
 * Get all category IDs
 */
export function getAllCategoryIds(): number[] {
  return Object.keys(CATEGORIES).map(Number);
}

/**
 * Get category name by ID (returns "Category {id}" if not found)
 */
export function getCategoryName(id: number): string {
  const cat = CATEGORIES[id];
  return cat ? cat.name : `Category ${id}`;
}
