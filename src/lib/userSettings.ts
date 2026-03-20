// src/lib/userSettings.ts

export interface UserSettings {
    theme?:           "dark" | "light" | "system";
    sessionListView?: "grid" | "list";
    timezone?:        string;
    language?:        string;
    pronouns?:        string;
    room?: {
      transcription?:         boolean;
      storeTranscript?:       boolean;
      postSessionTranscribe?: boolean;
      recording?:             boolean;
      recordingResolution?:   "720p" | "1080p";
      maxPeers?:              number;
      requirePasscode?:       boolean;
      allowGuests?:           boolean;
    };
  }
  
  export const DEFAULT_SETTINGS: Required<UserSettings> & { room: Required<NonNullable<UserSettings["room"]>> } = {
    theme:           "system",
    sessionListView: "grid",
    timezone:        "UTC",
    language:        "en",
    pronouns:        "",
    room: {
      transcription:         false,
      storeTranscript:       false,
      postSessionTranscribe: false,
      recording:             false,
      recordingResolution:   "720p",
      maxPeers:              4,
      requirePasscode:       false,
      allowGuests:           true,
    },
  };
  
  export function mergeSettings(stored: UserSettings | null): typeof DEFAULT_SETTINGS {
    if (!stored) return DEFAULT_SETTINGS;
    return {
      ...DEFAULT_SETTINGS,
      ...stored,
      room: {
        ...DEFAULT_SETTINGS.room,
        ...(stored.room ?? {}),
      },
    };
  }
  
  export function sanitizeSettings(input: any): UserSettings {
    const out: UserSettings = {};
  
    if (input.theme && ["dark","light","system"].includes(input.theme))
      out.theme = input.theme;
  
    if (input.sessionListView && ["grid","list"].includes(input.sessionListView))
      out.sessionListView = input.sessionListView;
  
    if (typeof input.timezone === "string" && input.timezone.length < 100)
      out.timezone = input.timezone;
  
    if (typeof input.language === "string" && input.language.length < 20)
      out.language = input.language;
  
    if (typeof input.pronouns === "string" && input.pronouns.length < 50)
      out.pronouns = input.pronouns;
  
    if (input.room && typeof input.room === "object") {
      out.room = {};
      const r = input.room;
      if (typeof r.transcription === "boolean")         out.room.transcription = r.transcription;
      if (typeof r.storeTranscript === "boolean")       out.room.storeTranscript = r.storeTranscript;
      if (typeof r.postSessionTranscribe === "boolean") out.room.postSessionTranscribe = r.postSessionTranscribe;
      if (typeof r.recording === "boolean")             out.room.recording = r.recording;
      if (r.recordingResolution && ["720p","1080p"].includes(r.recordingResolution))
        out.room.recordingResolution = r.recordingResolution;
      if (typeof r.maxPeers === "number" && r.maxPeers >= 2 && r.maxPeers <= 12)
        out.room.maxPeers = r.maxPeers;
      if (typeof r.requirePasscode === "boolean") out.room.requirePasscode = r.requirePasscode;
      if (typeof r.allowGuests === "boolean")     out.room.allowGuests = r.allowGuests;
    }
  
    return out;
  }