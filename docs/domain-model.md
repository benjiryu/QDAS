# Domain Model

- Status: Draft for team review
- Version: 0.1
- Last updated: 2026-08-03

Single source for entity and field names. Pattern specifications reference these names and must not introduce their own.

Domain types live in `src/domain/`. Domain logic does not import from the presentation layer.

## 1. Relationships

```
Project
  has many Sources
  has many Users through Assignments
  has one active CodebookVersion
  has many CodingRounds

Source
  belongs to a Project
  has many SpeakerTurns, each having many TranscriptSegments
  or has many SurveyResponses
  has many Excerpts

TranscriptSegment
  belongs to a SpeakerTurn
  belongs to a Source
  has a stable identifier that never changes

Excerpt
  belongs to a Source
  bounded by a start and end TranscriptSegment
  belongs to a User as coder
  belongs to a CodingRound
  has many CodeAssignments
  may have Notes

Code
  belongs to a Project
  may have a parent Code
  belongs to a CodebookVersion

CodeAssignment
  belongs to an Excerpt
  belongs to a Code
  belongs to a User
  belongs to a CodingRound
  records the CodebookVersion in force at the time
  may have Notes

ReviewItem
  groups overlapping or related Excerpts across coders
  may have a Resolution

Resolution
  belongs to a ReviewItem
  preserves the original Excerpts and CodeAssignments rather than replacing them
```

## 2. Identity rules

- All identifiers are opaque strings, never array positions or derived values.
- `TranscriptSegment.segmentId` is assigned at conversion and never recomputed. Re-running conversion on unchanged input produces identical identifiers.
- `Code.canonicalOrderIndex` is computed once at import or approval and stored. It is not recomputed on render, so renaming a code does not move it.
- Every `CodeAssignment` records `codebookVersionId`, so a later codebook change never retroactively alters what a coder was working from.

## 3. Entities

```
Project
  projectId, name, description
  activeCodebookVersionId
  activeCodingRoundId
  phase

User
  userId, displayName, role

Assignment
  assignmentId, projectId, userId, sourceId, codingRoundId
  requiredCoderCount, status

Source
  sourceId, projectId, title, kind (transcript | survey)
  speakerCount, segmentCount, durationMs

Speaker
  speakerId, sourceId, label

SpeakerTurn
  turnId, sourceId, speakerId, sequenceIndex, segmentIds

TranscriptSegment
  segmentId, sourceId, turnId, speakerId
  sequenceIndex, startTimeMs, endTimeMs, text

SurveyResponse
  responseId, sourceId, respondentId, questionId, text
  reserved, no interface in v0.1

Excerpt
  excerptId, sourceId
  startSegmentId, endSegmentId
  startOffset, endOffset
  coderId, codingRoundId, createdAt, updatedAt

Code
  codeId, projectId, parentCodeId
  name, shortDefinition, fullDefinition
  inclusionCriteria, exclusionCriteria, examples, synonyms
  colorToken, status, canonicalOrderIndex

CodebookVersion
  codebookVersionId, projectId, versionLabel, createdAt, codeIds

CodeAssignment
  assignmentId, excerptId, codeId, coderId
  codingRoundId, codebookVersionId
  status, uncertaintyFlag, visibility, createdAt, updatedAt

Note
  noteId, authorId, noteType, noteText
  visibility, status, createdAt
  relatedExcerptId
  relatedAssignmentId, relatedCodeId, relatedReviewItemId (reserved)

CodingRound
  codingRoundId, projectId, label, phase, opensAt, closesAt

ReviewItem
  reviewItemId, sourceId, startSegmentId, endSegmentId
  excerptIds, status, discussionStatus

Resolution
  resolutionId, reviewItemId, decision, rationale
  participantIds, decidedAt
  affectedCodeIds, affectedExcerptIds, recodingRequired

SourcePosition
  userId, sourceId, activeSegmentId, updatedAt

ActivityRecord
  activityId, projectId, userId, action, targetId, createdAt
```

## 4. Enumerations

```
Code.status              approved | provisional | deprecated | merged
CodeAssignment.status    active | provisional | superseded
CodeAssignment.visibility  private | team | afterIndependentCoding
Note.visibility          private | team | administrator | afterIndependentCoding
User.role                coder | reviewer | qualitativeLead
Project.phase            setup | pilot | independentCoding | review | reflexivity | recoding | closed
```

`CodeAssignment.status = active` and `TranscriptSegment` display state `active` are unrelated. The first means an assignment against an approved code; the second means the current reading position. Both names are retained because each is idiomatic in its own context.

## 5. Fields reserved but unused in v0.1

Written so that later work does not require a migration.

- `Excerpt.startOffset` and `endOffset`. Always the full segment bounds. Word-level precision is an open question.
- `Note.relatedAssignmentId`, `relatedCodeId`, `relatedReviewItemId`. Notes attach only to excerpts in v0.1.
- `SurveyResponse` in its entirety.
- `ActivityRecord`. Written but not read.
