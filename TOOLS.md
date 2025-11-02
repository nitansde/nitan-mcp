# Nitan MCP Tools Reference

This document describes the tools available in this Discourse MCP server, including both standard Discourse API tools and custom enhancements for uscardforum.com.

## Core Discourse Tools

### discourse_search
Search site content with optional sorting.

**Input:**
```json
{
  "query": "credit card rewards",
  "with_private": false,  // Optional: include private messages (requires auth)
  "max_results": 10       // Optional: 1-50, default 10
}
```

**Output:**
- List of matching topics with titles and URLs
- JSON footer with structured data

---

### discourse_read_topic
Read a topic's metadata and posts. Can optionally filter to show only posts from a specific user.

**Input:**
```json
{
  "topic_id": 12345,
  "post_limit": 5,          // Optional: 1-20, default 5
  "start_post_number": 1,   // Optional: start from specific post
  "username": "john_doe"    // Optional: filter to posts by this user only
}
```

**Output:**
- Topic title, category, tags
- Posts with author, timestamp, and content
- Canonical topic link

---

### discourse_read_post
Read a single post by ID.

**Input:**
```json
{
  "post_id": 67890
}
```

**Output:**
- Author, timestamp, content
- Direct link to the post

---

### discourse_get_user
Get user profile information.

**Input:**
```json
{
  "username": "john_doe"
}
```

**Output:**
- Display name, trust level, joined date
- Short bio and profile link

---

### discourse_get_user_activity
Get a list of user posts and replies from a Discourse instance, with the most recent first. Returns 30 posts per page by default.

**Input:**
```json
{
  "username": "john_doe",
  "page": 0  // Optional: page 0 = offset 0, page 1 = offset 30, etc.
}
```

**Output:**
- List of user's recent posts and replies
- Post content, topic titles, and links
- Pagination information

---

### discourse_filter_topics
Filter topics with natural language category names and advanced query syntax.

**Input:**
```json
{
  "filter": "status:open order:latest",
  "categories": ["Chase Credit Cards", "American Express"],  // Optional: natural language names
  "page": 1,
  "per_page": 20
}
```

**Output:**
- Paginated topic list with titles and URLs
- JSON footer with pagination info

See [Query Language Reference](#query-language-reference) below for filter syntax.

---

### discourse_list_tags
List all available tags on the site.

**Input:**
```json
{}
```

**Output:**
- List of tags with usage counts
- Notice if tags are disabled on the site

---

## Custom Enhanced Tools

### 1. discourse_list_hot_topics
Get the current hot/trending topics from the forum. Hot topics are based on recent activity, views, and engagement.

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

### 2. discourse_list_notifications
Get user notifications from the forum. Requires authentication with user credentials.

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

### 3. discourse_list_top_topics
Get the top topics from the forum for a specific time period (daily, weekly, monthly, quarterly, yearly, or all time). Top topics are ranked by activity, views, and engagement.

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

### 4. discourse_list_excellent_topics
Get recent excellent topics from the forum. An excellent topic is a topic with over 50 likes that earned the "精彩的话题" (Excellent Topic) badge.

**Input:**
```json
{
  "limit": 10  // Optional: 1-50, default 10
}
```

**Output:**
- List of recent excellent topics with structured JSON data
- Each entry includes: topic ID, username of author, title, post count, and when it achieved excellence

**Example:**
```json
{
  "limit": 20
}
```

**Output format:**
```json
{
  "results": [
    {
      "id": 452676,
      "username": "leena",
      "title": "体会到了"他乡遇故知"是一件多么美好的事情！",
      "posts_count": 21,
      "granted_at": "2025-11-02T21:16:19.542Z"
    }
  ]
}
```

---

## Write Operations (Authentication Required)

### discourse_create_post
Create a new post (reply) in an existing topic.

**Input:**
```json
{
  "topic_id": 12345,
  "raw": "This is my reply to the topic..."
}
```

**Output:**
- Link to the created post
- Rate limited to ~1 request/second

---

### discourse_create_topic
Create a new topic.

**Input:**
```json
{
  "title": "My New Topic Title",
  "raw": "This is the content of my topic...",
  "category_id": 3,        // Optional: category ID
  "tags": ["question", "beginner"]  // Optional: topic tags
}
```

**Output:**
- Link to the created topic
- Rate limited to ~1 request/second

---

### discourse_create_category
Create a new category (admin/moderator only).

**Input:**
```json
{
  "name": "New Category",
  "color": "0088CC",              // Optional: hex color
  "text_color": "FFFFFF",         // Optional: hex text color
  "parent_category_id": 5,        // Optional: parent category
  "description": "Category description..."  // Optional
}
```

**Output:**
- Link to the created category
- Rate limited to ~1 request/second

---

### discourse_create_user
Create a new user account (admin only).

**Input:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securepassword",
  "username": "john_doe",
  "active": true  // Optional: activate immediately
}
```

**Output:**
- User profile link
- Rate limited to ~1 request/second

---

## Enhanced Category Support

The `discourse_filter_topics` tool now supports natural language category names.

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

## Tool Availability

### Authentication-Required Tools
These tools require authentication via `--username` and `--password`:
- `discourse_list_notifications`
- `discourse_get_user_activity` (for private content)
- All write operations (create_post, create_topic, etc.)

### Write Operations
Write tools are only available when:
1. `--allow-writes` flag is set AND
2. `--read-only` is false (or not set) AND
3. Authentication is configured via `--auth-pairs` or username/password

### Disabled Tools
The `discourse_list_categories` tool has been **disabled** because:
1. Category list was too long and not useful in MCP context
2. Replaced with hardcoded category mapping
3. Category names are now accepted directly in `discourse_filter_topics`

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

This fork includes automatic Cloudflare bypass with two methods:

1. **cloudscraper** - Traditional Python cloudscraper library
2. **curl_cffi** - Modern curl-impersonate library (faster and more reliable)
3. **both** (default) - Tries cloudscraper first, falls back to curl_cffi

```bash
# Use default (both methods with fallback)
nitan-mcp

# Use curl_cffi only (recommended for best performance)
nitan-mcp --bypass-method curl_cffi

# Use cloudscraper only
nitan-mcp --bypass-method cloudscraper

# Specify Python path if needed
nitan-mcp --bypass-method both --python-path /usr/local/bin/python3

# Increase timeout for slow responses
nitan-mcp --bypass-method both --timeout-ms 30000

# Legacy flag (still supported, equivalent to --bypass-method both)
nitan-mcp --use-cloudscraper
```

**Requirements:**
- Python 3.7+
- `pip3 install cloudscraper curl-cffi`

Or install all requirements:
```bash
pip3 install -r requirements.txt
```

The postinstall script attempts to install these dependencies automatically.

**Error Messages:**
If Python or dependencies are missing, you'll see bilingual error messages (English and Chinese) with instructions on how to install the required packages.

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

### Get Excellent Topics (50+ likes)
```json
{
  "limit": 15
}
```

### Get Funny Topics
```json
{
  "limit": 15
}
```
