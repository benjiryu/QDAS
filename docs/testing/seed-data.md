# Seed Data and Data Handling

- Status: Draft, contains an unresolved question that blocks build
- Version: 0.1
- Last updated: 2026-08-03

The team intends to use deidentified AFB transcript data and the corresponding project codebook. That decision improves the research and creates handling obligations this document sets out.

## 1. Why this is not simply a fixtures file

Realistic data is load-bearing for the findings. A twelve-sentence transcript and a flat eight-code codebook produce a session in which search is unnecessary, orientation is trivial, and codebook navigation costs nothing. Every problem this project exists to study appears only at realistic scale. Using AFB's actual material is the right call.

Deidentification is also not the same as unrestricted. Qualitative interview transcripts carry re-identification risk that survives removing names, and the risk is higher in a small, specific population. Employer references, rare circumstances, geographic detail, and distinctive phrasing can identify a participant to a reader who knows the community. This is not a reason to avoid the data. It is a reason to decide the handling rules before the data is in a repository that will be shared with a UCI MSE team.

## 2. Handling rules

### 2.1 Real data never enters version control

Real transcripts and the real codebook live in a gitignored local directory, `./data-local/`, and are loaded at runtime. `data-local/` is listed in `.gitignore` before any data is placed in it.

Reasons this is worth the small inconvenience:

- The repository can be shared with the MSE team, hosted on GitHub, and handed off without a data review at each step.
- Contributors who have not signed whatever agreement covers the data never receive it.
- Git history is permanent. A transcript committed once and removed later is still in the history.

### 2.2 Committed fixtures are synthetic

A synthetic transcript and codebook of matching shape are committed for unit tests, end-to-end tests, and any contributor without data access. They match the real data structurally so that tests are meaningful, and share none of its content.

### 2.3 LLM agent exposure

Running a repository-level coding agent means file contents are sent to a model provider. If real transcripts sit in the working tree, they are part of that flow.

Keeping real data in a gitignored directory reduces but does not eliminate this, since an agent can still read gitignored files. The rule in `CLAUDE.md` states that an agent must stop and ask rather than read real transcript content. Development should be done against the synthetic fixtures; real data is loaded for participant sessions.

Whether this arrangement is sufficient is a question for AFB, recorded in section 6.

### 2.4 Incidental disclosure

Transcript content does not appear in commit messages, issue titles, test names, code comments, screenshots in documentation, or bug reports. Reference segments by identifier.

## 3. Conversion pipeline

AFB transcripts arrive as documents with speaker labels and timestamps. The prototype needs addressable segments with stable identifiers. File import is simulated, so this conversion happens once, offline.

A conversion script in `scripts/` takes a source document and produces the seeded structure:

1. Parse speaker turns from the source document.
2. Split each turn into sentences.
3. Assign stable opaque identifiers to every turn and every sentence.
4. Preserve speaker identity and timestamps where present.
5. Emit JSON matching the domain model.

Identifiers are assigned once and committed to the local data directory alongside the output. Re-running the conversion must produce identical identifiers for unchanged input, or every excerpt recorded in a prior session breaks.

Sentence splitting on spoken transcript text is imperfect. False splits at abbreviations and disfluencies are acceptable; the output should be spot-checked rather than trusted, and a manual correction pass on the session transcript is cheaper than debugging odd excerpt boundaries during a session.

## 4. Required shape

Confirm the real material meets these before session one. Where it falls short, supplement rather than substitute.

| Property | Minimum | Reason |
|---|---|---|
| Transcript length | 45+ minutes, or roughly 300+ sentences | Orientation and position reporting only become real problems past the point where a participant can hold the whole source in memory |
| Speaker turns | 60+, with varied length | Backward expansion across a turn boundary must occur naturally, not as a contrived task |
| Long turns | At least three turns of 8+ sentences | Otherwise sentence-level addressing never justifies itself over turn-level |
| Codebook size | 30+ codes | Below roughly this, browsing is faster than searching and the search finding is unobtainable |
| Codebook depth | 3 levels, parent through grandchild | Matches the hierarchy in the existing prototype and tests indentation at high zoom |
| Codes with full definitions | All, including inclusion and exclusion criteria | Definition lookup is a tested behavior; codes with only names make it trivial |
| Similar code names | At least one pair | Disambiguation by definition is the reason definitions are in the panel |
| Pre-existing coded excerpts | 15+ from a simulated second coder | Required for slice 3, and for the coded-state visuals in slice 2 |
| Overlapping excerpts | At least 4 pairs with differing boundaries | The core comparison case in review |
| Sources per project | 2+ | Assignment and navigation are otherwise degenerate |

## 5. Reset

Session data resets to a known state between participants, through a single command. A participant must never encounter the previous participant's codes. This is a smoke test item.

## 6. Unresolved questions

**Does the existing agreement between AFB and the UCI team cover using this data for prototype development, for exposure to an LLM coding agent, and for display to research participants who are not the original interviewees?**
Owner: Benji, with Dr. Silverman. Evidence needed: the terms of the current data use arrangement, and whether UCI IRB review covers this use. Temporary assumption: none, this is not assumable. Implementation proceeds against synthetic fixtures until answered. This is the only item in the seed data specification that blocks anything.

**Will participants see transcripts about a topic they have professional familiarity with?**
Owner: Benji. Evidence needed: whether the sample transcripts relate to work AFB participants were involved in. If a participant recognizes the interview, that changes both the ethics and the validity of the session, since a participant who knows the content will not code it the way a stranger would. Temporary assumption: check before assigning transcripts to participants.

**Is the real codebook stable, or will it change during the research period?**
Owner: Angie. Evidence needed: whether the source project is still active. A codebook that changes mid-study makes findings across sessions incomparable. Temporary assumption: freeze a snapshot at the start and use it unchanged for all sessions.

**Who performs the deidentification check on the specific transcripts chosen?**
Owner: AFB. Evidence needed: confirmation that the selected sources have been reviewed, not just that deidentified material exists in general. Temporary assumption: confirm per transcript before use.
