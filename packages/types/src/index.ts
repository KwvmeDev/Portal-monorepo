// ============================================================
// Enums — mirror the Prisma schema ENUM definitions
// ============================================================

export type UserRole = 'member' | 'moderator' | 'org_admin' | 'super_admin';

export type OrgType = 'panafrican' | 'fraternity' | 'sorority' | 'general';

export type OrgVisibility = 'open' | 'invite_only';

export type MembershipStatus = 'pending' | 'approved' | 'rejected' | 'banned';

export type MembershipRole = 'member' | 'moderator' | 'admin';

export type ContentType = 'text' | 'rich_text' | 'image' | 'poll' | 'link' | 'repost';

export type VoteValue = 'up' | 'down';

export type NotificationType =
  | 'follow'
  | 'upvote_post'
  | 'upvote_comment'
  | 'comment'
  | 'reply'
  | 'repost'
  | 'quote'
  | 'mention'
  | 'join_request'
  | 'join_approved'
  | 'join_rejected'
  | 'dm';

export type ReportReason =
  | 'spam'
  | 'hate_speech'
  | 'harassment'
  | 'misinformation'
  | 'nsfw'
  | 'other';

export type ReportStatus =
  | 'pending'
  | 'reviewed'
  | 'actioned'
  | 'dismissed'
  | 'auto_flagged';

// ============================================================
// Domain interfaces — all date fields represented as ISO strings
// ============================================================

export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  universityId: string | null;
  role: UserRole;
  isBanned: boolean;
  banReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface University {
  id: string;
  name: string;
  domain: string | null;
  country: string;
  city: string;
}

export interface Organization {
  id: string;
  name: string;
  handle: string;
  description: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  type: OrgType;
  visibility: OrgVisibility;
  universityId: string | null;
  createdBy: string;
  createdAt: string;
}

export interface OrgMembership {
  id: string;
  userId: string;
  orgId: string;
  role: MembershipRole;
  status: MembershipStatus;
  joinedAt: string;
}

/** Embedded preview metadata scraped from link URLs */
export interface LinkPreview {
  title: string;
  description: string;
  imageUrl: string;
  url: string;
}

export interface Post {
  id: string;
  authorId: string;
  content: string | null;
  contentType: ContentType;
  mediaUrls: string[];
  linkUrl: string | null;
  linkPreview: LinkPreview | null;
  /**
   * Inlined poll data when the post is of type 'poll'.
   * Populated on API responses; null for non-poll posts.
   */
  pollData: Poll | null;
  pollId: string | null;
  orgId: string | null;
  universityId: string | null;
  /** ID of the post being reposted (simple repost, no added content) */
  repostOfId: string | null;
  /** ID of the post being quoted (repost with added commentary) */
  quoteOfId: string | null;
  quoteContent: string | null;
  upvotes: number;
  downvotes: number;
  commentCount: number;
  repostCount: number;
  isPinned: boolean;
  isRemoved: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Vote {
  id: string;
  userId: string;
  targetId: string;
  targetType: 'post' | 'comment';
  value: VoteValue;
  createdAt: string;
}

export interface Comment {
  id: string;
  postId: string;
  authorId: string;
  /** null for top-level comments; set when replying to another comment */
  parentId: string | null;
  content: string;
  upvotes: number;
  downvotes: number;
  isRemoved: boolean;
  createdAt: string;
}

export interface PollOption {
  id: string;
  text: string;
  voteCount: number;
}

export interface Poll {
  id: string;
  question: string;
  options: PollOption[];
  endsAt: string;
}

export interface PollVote {
  id: string;
  pollId: string;
  userId: string;
  optionId: string;
}

export interface Follow {
  followerId: string;
  followingId: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  participant1Id: string;
  participant2Id: string;
  lastMessageAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  isRead: boolean;
  createdAt: string;
}

export interface Notification {
  id: string;
  recipientId: string;
  actorId: string;
  type: NotificationType;
  targetId: string;
  targetType: string;
  isRead: boolean;
  createdAt: string;
}

export interface Report {
  id: string;
  reporterId: string;
  targetId: string;
  targetType: 'post' | 'comment' | 'user';
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  reviewedBy: string | null;
  createdAt: string;
}

// ============================================================
// Generic API response wrappers
// ============================================================

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}

// ============================================================
// Feed & Voting types — Sprint 3
// ============================================================

/**
 * Opaque cursor encoding (hotScore, postId) for stable feed pagination.
 * Encoded as a base64 string on the wire; decoded server-side only.
 */
export type FeedCursor = string;

/**
 * Snapshot of a user's vote state on a single post or comment.
 * Returned by votePost / voteComment and embedded in PostWithDetails.
 */
export interface VoteState {
  /** The current user's vote direction, or null if they have not voted. */
  userVote: VoteValue | null;
  upvotes: number;
  downvotes: number;
}

/**
 * Minimal author shape embedded in feed/post responses.
 * Avoids exposing sensitive User fields (email, password hash, etc.).
 */
export interface PostAuthor {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

/**
 * Minimal snapshot of the original post embedded inside a repost.
 * Contains only the fields needed to render the embedded card —
 * no vote counts, no comment counts, no org context.
 */
export interface RepostOrigin {
  id: string;
  content: string | null;
  contentType: ContentType;
  createdAt: string;
  mediaUrls: string[];
  author: PostAuthor;
}

/**
 * Full post shape returned by API endpoints that join related data.
 * Extends Post with resolved author, optional org, and caller's vote state.
 */
export interface PostWithDetails extends Post {
  /** Resolved author profile — always present (posts cannot be authorless). */
  author: PostAuthor;
  /** Resolved org — null when the post is not tied to an organisation. */
  org: Pick<Organization, 'id' | 'name' | 'handle' | 'avatarUrl'> | null;
  /** Caller's current vote state; null when the request is unauthenticated. */
  userVote: VoteValue | null;
  /** Whether the authenticated viewer already follows the post author. False when unauthenticated. */
  viewerFollowsAuthor: boolean;
  /** Resolved original post for reposts (contentType === 'repost'). Null for all other post types. */
  repostOf?: RepostOrigin | null;
}

/**
 * Single page of feed results with a cursor for fetching the next page.
 * Used by all three feed endpoints (Global, Campus, Org).
 */
export interface FeedPage {
  posts: PostWithDetails[];
  /** Cursor to pass as `?cursor=` to retrieve the next page. Null on the last page. */
  nextCursor: FeedCursor | null;
  hasMore: boolean;
}

// ============================================================
// Sprint 4 types — Comments, Social Graph, Search
// ============================================================

/**
 * Full comment shape returned by API endpoints that join author data.
 * Extends Comment with resolved author profile and caller's vote state.
 */
export interface CommentWithDetails extends Comment {
  /** Resolved author profile — always present (comments cannot be authorless). */
  author: PostAuthor;
  /** Caller's current vote on this comment; null when unauthenticated or no vote cast. */
  userVote: VoteValue | null;
}

/**
 * Single page of comments with a cursor for fetching the next page.
 * Used by the comments list endpoint.
 */
export interface CommentPage {
  comments: CommentWithDetails[];
  /** Cursor to pass as `?cursor=` to retrieve the next page. Null on the last page. */
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Follow relationship counts and viewer relationship status for a user.
 * Returned alongside profile data to avoid extra round-trips.
 */
export interface FollowStats {
  followersCount: number;
  followingCount: number;
  /** Whether the currently authenticated viewer follows this user. */
  isFollowing: boolean;
}

/**
 * Minimal public user shape used in search results and list views.
 * Omits sensitive fields (email, role, ban status) present on the full User type.
 */
export interface UserSummary {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  universityId: string | null;
  /** Included when the endpoint resolves follow stats for the current viewer. */
  followStats?: FollowStats;
}

/**
 * Minimal org shape used in search results and list views.
 * Omits internal fields (description, bannerUrl, createdBy, etc.) from the full Organization type.
 */
export interface OrgSummary {
  id: string;
  name: string;
  handle: string;
  avatarUrl: string | null;
  type: OrgType;
  visibility: OrgVisibility;
  memberCount: number;
}

/**
 * Combined search response covering users, posts, and organisations.
 * Each array may be empty when there are no matching results in that category.
 */
export interface SearchResults {
  users: UserSummary[];
  posts: PostWithDetails[];
  orgs: OrgSummary[];
}

// ============================================================
// Sprint 5 types — Notifications, Org Profiles, Org Members
// ============================================================

/**
 * Enriched notification shape returned by API endpoints.
 * Actor fields are resolved from the actor user record to avoid
 * extra client-side lookups. All optional reference IDs are null
 * when the notification is not related to that entity type.
 */
export interface NotificationWithDetails {
  id: string;
  /** The recipient user's ID (matches the authenticated caller). */
  recipientId: string;
  type: NotificationType;
  /** ID of the user who triggered the notification. */
  actorId: string;
  actorUsername: string;
  actorDisplayName: string;
  actorAvatarUrl: string | null;
  /** Polymorphic target — the entity this notification is about (post, comment, user, etc.). */
  targetId: string;
  targetType: string;
  isRead: boolean;
  createdAt: string;
}

/**
 * Single page of notifications with an unread count for badge display.
 * nextCursor is null on the last page.
 */
export interface NotificationPage {
  notifications: NotificationWithDetails[];
  /** Cursor to pass as `?cursor=` to retrieve the next page. Null on the last page. */
  nextCursor: string | null;
  /** Total number of unread notifications for the current user. */
  unreadCount: number;
}

/**
 * Full org profile shape returned by the org detail endpoint.
 * Extends OrgSummary with additional fields and viewer-specific membership state.
 */
export interface OrgProfile extends OrgSummary {
  description: string | null;
  bannerUrl: string | null;
  universityId: string | null;
  /** Set on chapter orgs — points to the umbrella/global org. */
  parentOrgId: string | null;
  /** Resolved parent org summary — populated when parentOrgId is set. */
  parentOrg: { id: string; name: string; handle: string } | null;
  postCount: number;
  /** Number of chapter orgs that list this org as their parent. Non-zero for umbrella orgs. */
  chapterCount: number;
  /** True when the org's OrgMembership visibility is 'public'. */
  isPublic: boolean;
  /**
   * The authenticated viewer's relationship with this org.
   * 'none'    — not a member and no pending request.
   * 'pending' — join request submitted, awaiting approval.
   * 'member'  — approved member with standard access.
   * 'admin'   — approved member with admin privileges.
   */
  membershipStatus: 'none' | 'member' | 'pending' | 'admin';
}

/**
 * A chapter org entry returned by GET /api/orgs/:id/chapters.
 * Extends OrgSummary with university context.
 */
export interface OrgChapter extends OrgSummary {
  universityId: string | null;
  universityName: string | null;
}

/**
 * Single org member entry returned in the org members list endpoint.
 * Role mirrors the MembershipRole values that are surfaced to end users.
 */
export interface OrgMember {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role: 'member' | 'admin' | 'owner';
  joinedAt: string;
}

// ============================================================
// Sprint 6 types — Direct Messages
// ============================================================

/**
 * View model for the conversation list surfaced to the calling user.
 * Rather than exposing raw participant1/participant2 schema fields,
 * this type resolves the "other" participant from the caller's perspective
 * so clients never need to branch on which slot the caller occupies.
 */
export interface ConversationSummary {
  id: string;
  /** ID of the other participant in this conversation. */
  otherUserId: string;
  otherUsername: string;
  otherDisplayName: string;
  otherAvatarUrl: string | null;
  /** Preview text of the most recent message; null when no messages exist yet. */
  lastMessage: string | null;
  /** ISO timestamp of the most recent message (mirrors Conversation.lastMessageAt). */
  lastMessageAt: string;
  /** Number of unread messages in this conversation for the calling user. */
  unreadCount: number;
}

/**
 * Full message shape returned by API endpoints, with sender fields inlined
 * to avoid extra client-side lookups on every message in a thread.
 */
export interface MessageWithSender {
  id: string;
  conversationId: string;
  senderId: string;
  senderUsername: string;
  senderDisplayName: string;
  senderAvatarUrl: string | null;
  content: string;
  isRead: boolean;
  /** ISO timestamp when the message was created. */
  createdAt: string;
}

/**
 * Single page of messages with a cursor for fetching older messages.
 * Messages are returned in descending chronological order (newest first);
 * nextCursor is null when the beginning of the thread has been reached.
 */
export interface MessagePage {
  messages: MessageWithSender[];
  /** Cursor to pass as `?cursor=` to retrieve the next (older) page. Null on the last page. */
  nextCursor: string | null;
}
