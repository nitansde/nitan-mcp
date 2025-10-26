# Nitan MCP Custom Tools Reference

This document describes the custom tools added to this fork for uscardforum.com.

## New Tools

### 1. list_hot_topics
Returns hot topics from the forum.

**Input:**
```json
{
  "limit": 10  // Optional: 1-50, default 10
}
```

**Output:**
- List of hot topics with titles, categories, and URLs
- JSON footer with structured data

**Example:**
```json
{
  "limit": 20
}
```

---

### 2. list_notifications
Returns user notifications (requires authentication).

**Input:**
```json
{
  "limit": 30,        // Optional: 1-60, default 30
  "unread_only": true // Optional: default true
}
```

**Output:**
- List of notifications with type, title, and links
- Unread count and total count

**Example:**
```json
{
  "limit": 50,
  "unread_only": false
}
```

---

### 3. list_top_topics
Returns top topics for a specific time period.

**Input:**
```json
{
  "period": "daily",  // Required: daily/weekly/monthly/quarterly/yearly/all
  "limit": 10         // Optional: 1-50, default 10
}
```

**Output:**
- List of top topics for the period with titles, categories, and URLs
- JSON footer with structured data

**Example:**
```json
{
  "period": "weekly",
  "limit": 25
}
```

---

### 4. filter_topics (Enhanced)
Filter topics with natural language category names.

**Input:**
```json
{
  "filter": "status:open order:latest",
  "categories": ["Chase Credit Cards", "American Express"],  // Optional: natural language names
  "page": 1,
  "per_page": 20
}
```

**Category Support:**
- Accepts natural language category names (e.g., "Chase Credit Cards")
- Automatically converts to Discourse category slugs
- Supports multiple categories (OR logic)
- See CATEGORIES.md for full list

**Example Queries:**
```json
// Find open topics in specific categories
{
  "filter": "status:open",
  "categories": ["Chase Credit Cards", "Points and Miles Strategy"]
}

// Find recent topics with likes
{
  "filter": "order:latest likes-min:5",
  "categories": ["Credit Card Basics"]
}

// Find topics with specific tags in a category
{
  "filter": "tag:sapphire-reserve",
  "categories": ["Chase Credit Cards"]
}
```

---

## Hardcoded Category Mapping

The tool now includes a hardcoded mapping of all uscardforum.com categories with:
- Category IDs
- Display names (natural language)
- URL slugs
- Descriptions
- Parent-child relationships

### Available Functions (src/tools/categories.ts)

```typescript
// Get category by ID
getCategoryById(id: number): Category | undefined

// Get category by natural language name
getCategoryByName(name: string): Category | undefined

// Get category display name (with fallback to slug)
getCategoryName(id: number, slug: string): string

// Get subcategories of a category
getSubcategories(parentId: number): Category[]

// Get all categories
getAllCategories(): Category[]
```

### Category Examples

```typescript
// Major categories
"Chase Credit Cards" (id: 3)
"American Express" (id: 4)
"Credit Card Basics" (id: 66)
"Points and Miles Strategy" (id: 11)
"Debit Cards & Bank Accounts" (id: 9)

// Subcategories
"Chase Sapphire Reserve" (id: 115, parent: Chase Credit Cards)
"Chase Sapphire Preferred" (id: 116, parent: Chase Credit Cards)
"Amex Platinum Card" (id: 117, parent: American Express)
```

See `src/tools/categories.ts` for the complete mapping.

---

## Disabled Tools

### list_categories
This tool has been **disabled** because:
1. Category list was too long and not useful in MCP context
2. Replaced with hardcoded category mapping
3. Category names are now accepted directly in `filter_topics`

If you need to see all categories, refer to `src/tools/categories.ts` or use the web interface.

---

## Authentication

All write operations and some read operations (like notifications) require authentication:

```bash
nitan-mcp \
  --site https://www.uscardforum.com/ \
  --use_cloudscraper \
  --username YOUR_USERNAME \
  --password YOUR_PASSWORD
```

---

## Cloudflare Bypass

This fork includes automatic Cloudflare bypass using Python cloudscraper:

```bash
# Enable cloudscraper
nitan-mcp --use_cloudscraper

# Specify Python path if needed
nitan-mcp --use_cloudscraper --python_path /usr/local/bin/python3

# Increase timeout for slow responses
nitan-mcp --use_cloudscraper --timeout_ms 30000
```

**Requirements:**
- Python 3.7+
- `pip3 install cloudscraper`

The postinstall script attempts to install cloudscraper automatically.

---

## Query Language Reference

For `filter_topics`, you can use these query tokens:

### Status
- `status:open` - Open topics
- `status:closed` - Closed topics
- `status:archived` - Archived topics

### Sorting
- `order:latest` - Latest activity
- `order:views` - Most views
- `order:likes` - Most likes
- `order:created` - Creation date

### Dates
- `created-after:2024-01-01`
- `created-before:2024-12-31`
- `activity-after:7` (days ago)

### Engagement
- `likes-min:5` - Minimum likes
- `posts-min:10` - Minimum posts
- `views-min:100` - Minimum views

### Tags
- `tag:sapphire-reserve`
- `tags:travel,hotels` (OR)
- `tags:travel+hotels` (AND)

### Personal (requires auth)
- `in:bookmarked` - Bookmarked topics
- `in:watching` - Watching topics

### Categories
Use the `categories` parameter with natural language names instead of query tokens.

---

## Examples

### Find Popular Recent Topics in Specific Categories
```json
{
  "categories": ["Chase Credit Cards", "American Express"],
  "filter": "order:latest likes-min:10 posts-min:5",
  "per_page": 20
}
```

### Get Weekly Top Topics
```json
{
  "period": "weekly",
  "limit": 30
}
```

### Check Unread Notifications
```json
{
  "unread_only": true,
  "limit": 50
}
```

### Browse Hot Topics
```json
{
  "limit": 25
}
```
