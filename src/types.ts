export interface Channel {
  channelId: string;
  channelName: string;
  channelUrl: string;
  watchCount: number;
  lastWatched: string;   // ISO string
  firstWatched: string;  // ISO string
  isSubscribed: boolean;
  // Enriched via YouTube API
  description?: string;
  subscriberCount?: number;
  uploadCount?: number;
  format?: 'shorts-first' | 'long-form' | 'mixed' | 'unknown';
  avgDurationSeconds?: number;
  enrichedAt?: string;
  // Classified via Claude API
  categoryPrimary?: string;
  categorySecondary?: string;
  classifiedAt?: string;
}

// Raw shape from Google Takeout watch-history.json
export interface TakeoutEntry {
  header: string;
  title: string;
  titleUrl?: string;
  subtitles?: Array<{ name: string; url: string }>;
  time: string;
  products?: string[];
  activityControls?: string[];
}
