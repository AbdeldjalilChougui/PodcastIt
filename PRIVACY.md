# PodcastIt privacy

PodcastIt runs inside Anna AI OS. It has no servers of its own and sends nothing to the developer.

- **What it reads:** the link, file or text you give it. Links are fetched by Anna's `web.fetch`; PDFs and text files are read in your browser.
- **AI processing:** the text is sent to the AI model and voice model you use in Anna (`llm.complete`, `audio.speak`), billed to your Anna credits, under Anna's terms.
- **What it stores:** episode titles, chapters, transcripts and up to 30,000 characters of the source are stored in your private PodcastIt storage in Anna. Episode audio is stored as files through Anna's upload service. Only your account can read them.
- **Deleting:** "Delete" removes the episode, its transcript and its stored source from your library. Anna does not let apps delete uploaded audio files directly; they are kept in Anna's per-user storage and are no longer linked anywhere.
- **No tracking:** no analytics, no cookies, no third-party scripts.

Questions: open an issue at https://github.com/AbdeldjalilChougui/PodcastIt/issues
