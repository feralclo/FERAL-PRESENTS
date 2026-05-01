# iOS Quest Pool Contract

> **Status:** v1.1 — drafted 2026-04-30, **`walkthrough_video_url` added 2026-05-01** (Section 9). Implement against this; ping the backend if anything is unclear rather than guessing.
> **Sibling docs:** `ENTRY-IOS-BACKEND-SPEC.md` (the master rep platform spec) — this doc is a focused supplement covering one feature.
> **Owner:** backend (FERAL-PRESENTS repo) writes the data, defines the shapes, ships the routes. iOS owns the UI build.

---

## 1 · Overview

Tenants can now upload a bulk pool of images and videos to a named **campaign** (e.g. "Only Numbers — Spring 26") and link a quest to that campaign. Reps see a rotating window of up to **10 assets** they can download and post — instead of one fixed shareable.

The rotation happens server-side. Your job on iOS is simply to render the server's order, log the download, and save the file. Don't re-sort.

---

## 2 · Detection — when to render the new screen

Every quest now carries an `asset_mode` field on `RepQuestDTO`:

| `asset_mode` | What it means | Render |
|---|---|---|
| `"single"` | Existing behaviour — quest has one fixed shareable | Existing single-asset screen |
| `"pool"` | New — quest pulls from a campaign | The new asset-grid screen (Section 5) |

**Quest cards** can also display a count without a fetch using `asset_pool.count`. Show "47 assets" as a small subtitle pill on the card.

### 2.1 Updated `RepQuestDTO` shape

These fields are added — every other field is unchanged:

```jsonc
{
  // ... all existing fields
  "asset_mode": "pool",
  "asset_pool": {
    "count": 47,
    "image_count": 31,
    "video_count": 16,
    "sample_thumbs": [
      "https://example.com/.../tile1.webp",
      "https://example.com/.../tile2.webp",
      "https://example.com/.../tile3.webp"
    ]
  },
  "walkthrough_video_url": "abc123muxPlaybackId"
}
```

`asset_pool` is **null** when `asset_mode === "single"`. `sample_thumbs` always has up to 3 entries — use them on the quest card as a 3-up thumbnail strip if you want; the actual list comes from the GET below.

`walkthrough_video_url` is **null** unless the tenant uploaded a screen recording showing reps how to do the quest. It's independent of `asset_mode` — both single and pool quests can have one. See Section 9.

### 2.2 Endpoints that ship these fields

You'll see `asset_mode` + `asset_pool` on every existing quest endpoint:

- `GET /api/rep-portal/quests`
- `GET /api/rep-portal/quests/[id]` (if your client uses it)
- `GET /api/rep-portal/dashboard` (in the `quests` block)

No request changes needed — you're already calling these.

---

## 3 · GET /api/rep-portal/quests/{questId}/assets

Returns up to 10 assets, server-sorted by the rotation rule (Section 6). **Don't re-sort.** Render in array order.

### 3.1 Request

```
GET /api/rep-portal/quests/{questId}/assets
Authorization: Bearer {access_token}
```

No query parameters. No pagination.

### 3.2 Response (200)

```jsonc
{
  "data": [
    {
      "id": "media-uuid-1",
      "media_kind": "image",
      "url": "https://example.com/.../1200.webp",
      "playback_url": null,
      "thumbnail_url": null,
      "width": 1200,
      "height": 1500,
      "duration_seconds": null,
      "is_downloaded_by_me": false,
      "my_last_used_at": null,
      "download_count_total": 12
    },
    {
      "id": "media-uuid-2",
      "media_kind": "video",
      "url": "https://image.mux.com/.../thumbnail.webp",
      "playback_url": "https://stream.mux.com/.../high.m3u8",
      "thumbnail_url": "https://image.mux.com/.../thumbnail.webp",
      "width": 1080,
      "height": 1920,
      "duration_seconds": 18,
      "is_downloaded_by_me": true,
      "my_last_used_at": "2026-04-28T14:22:01Z",
      "download_count_total": 41
    }
    // … up to 10 entries
  ],
  "campaign": {
    "label": "Only Numbers — Spring 26",
    "total_in_pool": 47
  },
  "rotation_position": "mixed"
}
```

### 3.3 Field rules

| Field | Type | Notes |
|---|---|---|
| `id` | uuid string | Stable; use as cell identifier |
| `media_kind` | `"image"` or `"video"` | Drives tile layout (play glyph for video) |
| `url` | string | Image: canonical WebP. Video: thumbnail (same as `thumbnail_url`) |
| `playback_url` | string \| null | Video only — HLS for streaming preview |
| `thumbnail_url` | string \| null | Video only — same as `url` for video rows; null for image rows |
| `width`, `height` | int \| null | Pixel dimensions; usable for `AspectRatio` placeholders |
| `duration_seconds` | int \| null | Video only |
| `is_downloaded_by_me` | bool | Render "Used" pill if true |
| `my_last_used_at` | ISO 8601 \| null | Optional secondary copy ("Used Mar 12"). Null if `is_downloaded_by_me` is false |
| `download_count_total` | int | Lightly informational; safe to ignore in v1 |
| `rotation_position` | `"fresh"` \| `"mixed"` \| `"all-used"` | UX hint — see Section 5.4 for empty-state recommendation |

### 3.4 Errors

| Status | Body code | Meaning | Suggested user copy |
|---|---|---|---|
| 400 | `not_a_pool_quest` | Quest is in single-asset mode | "This quest doesn't have a pool" — fall back to single-asset screen |
| 403 | `not_on_team` | Rep is not approved on the quest's promoter | "You're not on this team yet" |
| 404 | `quest_not_found` | Quest ID doesn't exist | "Quest not found" |
| 500 | (generic) | Server error | "Something went wrong — try again" |

---

## 4 · POST /api/rep-portal/quests/{questId}/assets/{mediaId}/download

Logs the download server-side and returns a canonical URL. **Idempotent** — calling twice is safe; `first_time` flips to `false` on the second call.

### 4.1 Request

```
POST /api/rep-portal/quests/{questId}/assets/{mediaId}/download
Authorization: Bearer {access_token}
```

No body.

### 4.2 Response (200)

```jsonc
{
  "url": "https://stream.mux.com/.../high.mp4?token=…",
  "expires_at": "2026-05-01T13:00:00Z",
  "first_time": true
}
```

| Field | Notes |
|---|---|
| `url` | Image: same as the `url` you already had. Video: a Mux MP4 download URL (use this, not the HLS playback URL, when writing to PHPhotoLibrary). |
| `expires_at` | ISO 8601 \| null. Null = permanent URL (images). Populated = token-signed (videos, 24h validity). |
| `first_time` | `true` if this was the rep's first download of this asset; `false` on subsequent calls. Useful for one-time UX (e.g. a subtle haptic / toast on first save only). |

### 4.3 Errors

| Status | Body code | Meaning |
|---|---|---|
| 400 | `not_a_pool_quest` | Quest is single-asset mode |
| 403 | `not_on_team` | Rep is not approved on this team |
| 403 | `media_not_in_quest_pool` | The mediaId isn't in this quest's campaign |
| 404 | `quest_not_found` | Quest ID doesn't exist |
| 404 | `media_not_found` | Media ID doesn't exist or was deleted |

---

## 5 · UX recommendations (non-binding)

iOS owns the visual decisions, but a few notes on what the data implies.

### 5.1 Asset grid

- 2-column edge-to-edge grid, mixed images and videos.
- Square or 3:4 tiles — the data has mixed aspect ratios; pick a uniform tile shape and use `aspectFill`.
- Video tiles get a small play glyph in the corner. **Do not** auto-loop in the grid view — battery drain. Static thumbnail is fine.
- "Used" tiles dim slightly (e.g. 60% opacity) and show a small pill in the top-right.

### 5.2 Tap → fullscreen preview

- Three actions: **Save to Photos** (primary), **Share** (secondary), Close.
- For images: download URL → write to `PHPhotoLibrary` directly.
- For videos: download URL → write to `PHPhotoLibrary` (the Mux MP4 URL is what to download, not the HLS).
- Optimistically mark the tile as used once the save succeeds. If the server's `first_time === false`, you can skip the optimistic update — it was already used.

### 5.3 Pull-to-refresh

- On pull, re-fetch `GET /assets`. The server returns a fresh ordering reflecting any new uploads + the rep's most-recent downloads.
- **Do not** cache more than 5 minutes — the rotation is meant to feel live.

### 5.4 Empty / exhaustion states

- `rotation_position === "fresh"`: nothing special. Standard grid.
- `rotation_position === "mixed"`: nothing special. Used tiles already styled.
- `rotation_position === "all-used"`: subtle banner above the grid: `"You've used everything in this campaign. Showing your oldest first — fresh assets land at the top when admins upload."` Tone is informative, not apologetic.

### 5.5 Permissions

Add to `Info.plist` if not already present:

```xml
<key>NSPhotoLibraryAddUsageDescription</key>
<string>Save quest shareables to your camera roll so you can post them to Instagram or TikTok.</string>
```

(Likely already there for ticket QR saves — verify before submitting.)

---

## 6 · How the server picks 10 (background, for trust)

You don't need to implement any of this. It's documented so you can tell promoters how it works.

The server runs a single SQL ordering against the campaign's full asset list:

1. **Never downloaded by this rep** first → ordered by newest upload (`created_at DESC`).
2. **Already downloaded** → ordered by *oldest* download first (longest-ago-used).

Take the first 10. That's the response.

Behavioural consequences:
- New uploads bubble to the top of every rep's feed.
- Reps who've used 8/50 see 10 fresh assets they haven't seen.
- Reps who've used all 50 see the 10 they downloaded longest ago.
- Two reps on the same team see different orderings (independent histories).
- Pull-to-refresh re-runs the sort, so the feed updates as state changes.

---

## 7 · Suggested Swift model shape

For reference — adapt to your project's conventions.

```swift
enum QuestAssetMode: String, Decodable {
    case single
    case pool
}

struct QuestAssetPoolSummary: Decodable {
    let count: Int
    let imageCount: Int
    let videoCount: Int
    let sampleThumbs: [URL]

    enum CodingKeys: String, CodingKey {
        case count
        case imageCount = "image_count"
        case videoCount = "video_count"
        case sampleThumbs = "sample_thumbs"
    }
}

enum QuestAssetMediaKind: String, Decodable {
    case image
    case video
}

struct QuestAsset: Identifiable, Decodable {
    let id: String
    let mediaKind: QuestAssetMediaKind
    let url: URL
    let playbackURL: URL?
    let thumbnailURL: URL?
    let width: Int?
    let height: Int?
    let durationSeconds: Int?
    let isDownloadedByMe: Bool
    let myLastUsedAt: Date?
    let downloadCountTotal: Int

    enum CodingKeys: String, CodingKey {
        case id
        case mediaKind = "media_kind"
        case url
        case playbackURL = "playback_url"
        case thumbnailURL = "thumbnail_url"
        case width
        case height
        case durationSeconds = "duration_seconds"
        case isDownloadedByMe = "is_downloaded_by_me"
        case myLastUsedAt = "my_last_used_at"
        case downloadCountTotal = "download_count_total"
    }
}

enum QuestAssetRotationPosition: String, Decodable {
    case fresh
    case mixed
    case allUsed = "all-used"
}

struct QuestAssetCampaign: Decodable {
    let label: String
    let totalInPool: Int

    enum CodingKeys: String, CodingKey {
        case label
        case totalInPool = "total_in_pool"
    }
}

struct QuestAssetsResponse: Decodable {
    let data: [QuestAsset]
    let campaign: QuestAssetCampaign
    let rotationPosition: QuestAssetRotationPosition

    enum CodingKeys: String, CodingKey {
        case data
        case campaign
        case rotationPosition = "rotation_position"
    }
}

struct QuestAssetDownloadResponse: Decodable {
    let url: URL
    let expiresAt: Date?
    let firstTime: Bool

    enum CodingKeys: String, CodingKey {
        case url
        case expiresAt = "expires_at"
        case firstTime = "first_time"
    }
}
```

---

## 8 · What you can build right now

Backend ETA is ~1 week. You can build everything end-to-end against mocks:

1. **Decode** `asset_mode` + `asset_pool` on `RepQuestDTO`. Won't change behaviour until backend ships data.
2. **`QuestAssetGridScreen`** rendering 10 mock tiles with the shape above.
3. **Fullscreen preview** with Save / Share / Close.
4. **Stub the two endpoints** through your existing `APIRepSession` networking — they'll 404 until backend ships, that's fine. Hide the screen behind a debug flag.
5. **Verify Info.plist** has `NSPhotoLibraryAddUsageDescription`.

When backend ships, you flip the debug flag and swap mocks for real fetches. Should be a one-line change if the contract holds.

---

## 9 · Walkthrough video (independent of pool mode)

Tenants can optionally upload a short screen recording showing reps how to do a quest — typically a 15–60 second walkthrough of "open TikTok, paste this sound, post to story." Lives on every quest, single-asset and pool alike.

### 9.1 Field

Added to `RepQuestDTO`:

| Field | Type | Notes |
|---|---|---|
| `walkthrough_video_url` | string \| null | Mux playback id (same convention as `video_url`). Null when the tenant didn't upload one. |

You construct the streaming URL the same way you do for `video_url` — `https://stream.mux.com/{playbackId}.m3u8` for HLS, `https://stream.mux.com/{playbackId}/high.mp4` for MP4. The existing Mux player surface in the app already handles this shape.

### 9.2 UX recommendation (non-binding)

A small **Watch how** button on the `QuestDetailSheet` near the title — opens the existing Mux video player you use for shareable preview, plays inline or full-screen, dismisses back to the sheet. Hide the button entirely when `walkthrough_video_url === null`.

Tone: this is the tenant being helpful, not a tutorial system. Keep the affordance light — secondary button or tertiary chip, not a hero block. Reps who already know how to post don't need to see it; reps who are confused will appreciate it.

### 9.3 What you can build right now

1. Decode `walkthrough_video_url` on `RepQuestDTO` (`String?`).
2. Add the **Watch how** affordance to `QuestDetailSheet`, gated on the field being non-nil.
3. Reuse your existing Mux player route — no new networking surface, no new endpoints.

No backend wait. Backend ships the field as part of the quest editor redesign rollout (~1 week).

---

## 10 · Change policy

Any change to this contract requires:
1. A note in the Decision log of `LIBRARY-CAMPAIGNS-PLAN.md` (pool-related changes) or `QUEST-EDITOR-REDESIGN.md` (other quest fields).
2. A heads-up to the iOS team before the change lands.
3. A bump of this doc's `Status:` line.

Backend won't silently change the shape. If iOS wants to suggest a change, raise it in the same channel — non-breaking additions are easy, breaking changes need coordination.
