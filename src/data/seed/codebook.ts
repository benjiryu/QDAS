/**
 * Synthetic codebook. Forty codes, three levels deep.
 *
 * Specification: docs/testing/seed-data.md section 4.
 *
 * Every code carries a full definition, inclusion criteria, and exclusion
 * criteria, because definition lookup is a tested behavior and a codebook of
 * bare names makes disambiguation trivial.
 *
 * Two pairs of codes are deliberately close in name, so that telling them apart
 * requires reading a definition rather than scanning a list:
 *
 *   Water access          vs  Water access rules
 *   New member support    vs  New member onboarding
 *
 * `examples` is empty on every code. D-019 keeps examples in the model and out
 * of v0.1, and D-022 keeps them out of independent coding when they arrive.
 *
 * `canonicalOrderIndex` is stored, never computed at render time, so renaming a
 * code does not move it. Domain model section 2, decision D-004.
 */

import type { Code, CodebookVersion } from '../../domain/types';
import { CODEBOOK_VERSION_ID, PROJECT_ID } from './project';

type SeedCode = Omit<Code, 'projectId' | 'examples' | 'status' | 'canonicalOrderIndex'>;

/**
 * Canonical order. The array order here is the canonical order, and the index
 * is stamped onto each code below.
 */
const codesInCanonicalOrder: SeedCode[] = [
  /* ---------- 1. Motivation and meaning ---------- */
  {
    codeId: 'cd-2f7a01',
    parentCodeId: null,
    name: 'Motivation and meaning',
    shortDefinition: 'Why a member joined and what the plot means to them.',
    fullDefinition:
      'Statements about what drew a person to the garden and what keeps them there, ' +
      'including how that account changes as they describe later seasons.',
    inclusionCriteria:
      'Apply to first-person accounts of wanting, joining, or continuing, and to reflections ' +
      'on what the garden is for.',
    exclusionCriteria:
      'Do not apply to descriptions of what a person grows or does, unless the passage states ' +
      'why it matters to them. Use a child code where one fits.',
    synonyms: ['why people join', 'meaning'],
    colorToken: 'code-color-moss',
  },
  {
    codeId: 'cd-9b14e5',
    parentCodeId: 'cd-2f7a01',
    name: 'Food production motivation',
    shortDefinition: 'Participation motivated by growing food to eat or give away.',
    fullDefinition:
      'Accounts in which the produce itself is the reason for the plot, whether the food ' +
      'feeds a household, is given to neighbours, or is donated.',
    inclusionCriteria:
      'Apply where the passage ties participation to the food produced, including where the ' +
      'speaker contrasts food-first gardening with other purposes.',
    exclusionCriteria:
      'Do not apply to logistics of harvesting or storage that carry no statement of purpose.',
    synonyms: ['growing to eat'],
    colorToken: 'code-color-moss',
  },
  {
    codeId: 'cd-51c308',
    parentCodeId: 'cd-9b14e5',
    name: 'Household food supply',
    shortDefinition: 'Produce that matters to the household budget or diet.',
    fullDefinition:
      'The plot contributes materially to what the household eats, described as a quantity, ' +
      'a saving, or a dependence rather than as a pleasure.',
    inclusionCriteria:
      'Apply where the passage indicates the food is counted on, including second-hand ' +
      'descriptions of other members who garden this way.',
    exclusionCriteria:
      'Do not apply to occasional or incidental eating of what was grown. Use the parent code.',
    synonyms: ['subsistence', 'grocery budget'],
    colorToken: 'code-color-moss',
  },
  {
    codeId: 'cd-7d40ba',
    parentCodeId: 'cd-9b14e5',
    name: 'Sharing and donation',
    shortDefinition: 'Produce given to other members, neighbours, or a food pantry.',
    fullDefinition:
      'Movement of produce out of the household, and any account of how well or badly that ' +
      'movement works, including mismatches between what is grown and what is wanted.',
    inclusionCriteria:
      'Apply to giving, donating, and to the coordination problems that surround them.',
    exclusionCriteria:
      'Do not apply to sharing of seeds, tools, or labour. Those belong under Reciprocity ' +
      'expectations.',
    synonyms: ['donation bin', 'giving away produce'],
    colorToken: 'code-color-moss',
  },
  {
    codeId: 'cd-c62917',
    parentCodeId: 'cd-2f7a01',
    name: 'Non-food motivation',
    shortDefinition: 'Participation motivated by something other than produce.',
    fullDefinition:
      'Reasons for gardening that do not depend on the harvest, including being outdoors, ' +
      'having a project, structuring time, and meeting people.',
    inclusionCriteria:
      'Apply where the stated reason would survive a bad harvest.',
    exclusionCriteria:
      'Do not apply where the speaker names food as the reason and mentions other benefits ' +
      'only in passing.',
    synonyms: ['other reasons'],
    colorToken: 'code-color-moss',
  },
  {
    codeId: 'cd-38e9d1',
    parentCodeId: 'cd-c62917',
    name: 'Being outdoors',
    shortDefinition: 'Wanting time outside, away from screens or indoor work.',
    fullDefinition:
      'The plot as a reason to leave the house, including accounts where the obligation to ' +
      'water is what produces the going.',
    inclusionCriteria:
      'Apply to statements about air, weather, physical presence, and getting out.',
    exclusionCriteria: 'Do not apply to exercise framed as fitness rather than as being outside.',
    synonyms: ['fresh air', 'getting outside'],
    colorToken: 'code-color-moss',
  },
  {
    codeId: 'cd-a70b4c',
    parentCodeId: 'cd-c62917',
    name: 'Social connection as motivation',
    shortDefinition: 'Joining or staying in order to be around other people.',
    fullDefinition:
      'Company as a stated reason for participation, including its opposite, where a member ' +
      'chooses hours that avoid other people.',
    inclusionCriteria:
      'Apply where the presence or absence of other members is given as a reason for how or ' +
      'when a person gardens.',
    exclusionCriteria:
      'Do not apply to descriptions of relationships that carry no statement about ' +
      'motivation. Use Social dynamics.',
    synonyms: ['community as a draw'],
    colorToken: 'code-color-moss',
  },
  {
    codeId: 'cd-4e5f82',
    parentCodeId: 'cd-2f7a01',
    name: 'Change in motivation over time',
    shortDefinition: 'A stated shift in why the person gardens.',
    fullDefinition:
      'Passages comparing an earlier reason for gardening with a current one, including ' +
      'shifts from achievement to habit, or from private project to shared place.',
    inclusionCriteria:
      'Apply only where two points in time are compared, whether or not the speaker names a ' +
      'cause.',
    exclusionCriteria:
      'Do not apply to a single-season account, however reflective.',
    synonyms: ['shift over seasons'],
    colorToken: 'code-color-moss',
  },

  /* ---------- 2. Barriers to participation ---------- */
  {
    codeId: 'cd-06ba73',
    parentCodeId: null,
    name: 'Barriers to participation',
    shortDefinition: 'Anything that makes taking part harder or impossible.',
    fullDefinition:
      'Obstacles to joining, to using a plot, or to staying, whether physical, ' +
      'informational, financial, or temporal.',
    inclusionCriteria:
      'Apply where a passage describes something preventing or impeding participation, ' +
      'including for members other than the speaker.',
    exclusionCriteria:
      'Do not apply to ordinary gardening difficulty such as a failed crop. Use a child code ' +
      'where one fits.',
    synonyms: ['obstacles', 'friction'],
    colorToken: 'code-color-clay',
  },
  {
    codeId: 'cd-b3d940',
    parentCodeId: 'cd-06ba73',
    name: 'Physical site access',
    shortDefinition: 'The built site as an obstacle to using a plot.',
    fullDefinition:
      'Paths, gates, sheds, seating, bed heights, and any other physical feature that ' +
      'determines who can use the site and how.',
    inclusionCriteria:
      'Apply to descriptions of the physical environment that bear on who can get in, move ' +
      'around, or work a plot.',
    exclusionCriteria:
      'Do not apply to the rules governing who is allocated an accessible plot. Those belong ' +
      'under Resource allocation.',
    synonyms: ['site accessibility'],
    colorToken: 'code-color-clay',
  },
  {
    codeId: 'cd-f8126e',
    parentCodeId: 'cd-b3d940',
    name: 'Path and gate access',
    shortDefinition: 'Circulation into and around the site.',
    fullDefinition:
      'Path width and surface, gate weight and latches, steps, and the routes between the ' +
      'entrance, the plots, and shared facilities.',
    inclusionCriteria: 'Apply to any account of moving through the site or failing to.',
    exclusionCriteria: 'Do not apply to the beds themselves. Use Raised bed availability.',
    synonyms: ['paths', 'gate'],
    colorToken: 'code-color-clay',
  },
  {
    codeId: 'cd-2c9407',
    parentCodeId: 'cd-b3d940',
    name: 'Raised bed availability',
    shortDefinition: 'Supply of beds usable without ground-level work.',
    fullDefinition:
      'The number, placement, and desirability of raised beds, and the consequences of there ' +
      'being few of them.',
    inclusionCriteria:
      'Apply to the beds as a physical resource, including their desirability for reasons ' +
      'unrelated to access.',
    exclusionCriteria:
      'Do not apply to disputes over who should get one, which is Resource allocation, though ' +
      'a passage may carry both.',
    synonyms: ['accessible beds'],
    colorToken: 'code-color-clay',
  },
  {
    codeId: 'cd-97af51',
    parentCodeId: 'cd-06ba73',
    name: 'Water access',
    shortDefinition: 'Physical availability of water at the plot.',
    fullDefinition:
      'Where water is, how much of it there is, and whether it reaches a given plot. This is ' +
      'the infrastructure, not the policy.',
    inclusionCriteria:
      'Apply to spigots, pressure, hoses, distance, and carrying, including consequences for ' +
      'particular parts of the site.',
    exclusionCriteria:
      'Do not apply to the watering schedule or to disputes about following it. Use Water ' +
      'access rules, which is a separate code with a similar name.',
    synonyms: ['spigots', 'water supply'],
    colorToken: 'code-color-clay',
  },
  {
    codeId: 'cd-5db8c2',
    parentCodeId: 'cd-97af51',
    name: 'Water pressure',
    shortDefinition: 'Pressure varying by location and time of day.',
    fullDefinition:
      'Accounts of pressure differences across the site, and of the parts of the site those ' +
      'differences make hard to garden.',
    inclusionCriteria: 'Apply where pressure, flow, or timing of supply is described.',
    exclusionCriteria: 'Do not apply to the number or placement of spigots alone.',
    synonyms: ['pressure differential'],
    colorToken: 'code-color-clay',
  },
  {
    codeId: 'cd-e40173',
    parentCodeId: 'cd-06ba73',
    name: 'Entry barriers',
    shortDefinition: 'Obstacles encountered before or just after joining.',
    fullDefinition:
      'Everything between wanting a plot and being able to use one, including the wait, the ' +
      'cost, and the information a new member does or does not receive.',
    inclusionCriteria: 'Apply to the joining process and to the first season.',
    exclusionCriteria:
      'Do not apply to obstacles that recur for established members, such as the water ' +
      'schedule.',
    synonyms: ['getting in'],
    colorToken: 'code-color-clay',
  },
  {
    codeId: 'cd-71fe0d',
    parentCodeId: 'cd-e40173',
    name: 'Waiting list',
    shortDefinition: 'Time between applying and being offered a plot.',
    fullDefinition:
      'The wait itself, its length, how it is communicated, and what applicants do while ' +
      'waiting.',
    inclusionCriteria: 'Apply to any account of waiting for a plot or of the list as a system.',
    exclusionCriteria:
      'Do not apply to the allocation of a specific plot once an offer is made. Use Resource ' +
      'allocation.',
    synonyms: ['the list', 'wait time'],
    colorToken: 'code-color-clay',
  },
  {
    codeId: 'cd-8a3b96',
    parentCodeId: 'cd-e40173',
    name: 'Information gaps at entry',
    shortDefinition: 'Information that exists but does not reach a new member.',
    fullDefinition:
      'Cases where a rule, resource, or norm was documented or known but the new member did ' +
      'not receive it, and what that cost them.',
    inclusionCriteria:
      'Apply where the gap is between information existing and information arriving, ' +
      'including retrospective discovery of a handbook or notice.',
    exclusionCriteria:
      'Do not apply where the information does not exist anywhere. That is an unwritten norm ' +
      'and belongs under Informal norms.',
    synonyms: ['nobody told me'],
    colorToken: 'code-color-clay',
  },

  /* ---------- 3. Social dynamics ---------- */
  {
    codeId: 'cd-d519f8',
    parentCodeId: null,
    name: 'Social dynamics',
    shortDefinition: 'Relations between members and how the group behaves.',
    fullDefinition:
      'How members treat one another, form groups, handle disagreement, and decide who ' +
      'belongs, whether or not any rule is involved.',
    inclusionCriteria: 'Apply to interactions, expectations, and group composition.',
    exclusionCriteria:
      'Do not apply to formal decision making by the committee. Use Site governance.',
    synonyms: ['social life'],
    colorToken: 'code-color-indigo',
  },
  {
    codeId: 'cd-3ca628',
    parentCodeId: 'cd-d519f8',
    name: 'Informal norms',
    shortDefinition: 'Unwritten expectations members are held to.',
    fullDefinition:
      'Expectations enforced by approval and disapproval rather than by rules, including the ' +
      'observation that they are invisible to newcomers.',
    inclusionCriteria:
      'Apply where behaviour is expected but not written down, and where a speaker describes ' +
      'the unwritten character of an expectation.',
    exclusionCriteria: 'Do not apply to written rules, even where enforcement is informal.',
    synonyms: ['unwritten rules'],
    colorToken: 'code-color-indigo',
  },
  {
    codeId: 'cd-6f7204',
    parentCodeId: 'cd-3ca628',
    name: 'Reciprocity expectations',
    shortDefinition: 'Obligation created by receiving seeds, plants, tools, or help.',
    fullDefinition:
      'The expectation that something given will be returned in kind or in time, and the ' +
      'consequences for a member who does not return it.',
    inclusionCriteria:
      'Apply to giving and returning between members, and to accounts of exclusion following ' +
      'a failure to reciprocate.',
    exclusionCriteria:
      'Do not apply to produce donated outside the garden. Use Sharing and donation.',
    synonyms: ['give and take'],
    colorToken: 'code-color-indigo',
  },
  {
    codeId: 'cd-b0e341',
    parentCodeId: 'cd-3ca628',
    name: 'Indirect conflict',
    shortDefinition: 'Disagreement handled through third parties or general notices.',
    fullDefinition:
      'Conflict routed through someone else, or addressed by a general announcement everyone ' +
      'understands to be aimed at one person.',
    inclusionCriteria:
      'Apply where the complaint does not reach its subject directly, including where the ' +
      'speaker judges that this works or fails.',
    exclusionCriteria: 'Do not apply where two members address each other directly.',
    synonyms: ['passive complaint', 'going around'],
    colorToken: 'code-color-indigo',
  },
  {
    codeId: 'cd-4826bd',
    parentCodeId: 'cd-d519f8',
    name: 'Newcomer integration',
    shortDefinition: 'How new members are, or are not, brought into the group.',
    fullDefinition:
      'The process by which a new member becomes a known member, including its failures and ' +
      'the effect on whether they stay.',
    inclusionCriteria: 'Apply to the first two seasons of membership from either side.',
    exclusionCriteria:
      'Do not apply to teaching gardening technique. Use Learning and knowledge transfer.',
    synonyms: ['joining the group'],
    colorToken: 'code-color-indigo',
  },
  {
    codeId: 'cd-19c7e6',
    parentCodeId: 'cd-4826bd',
    name: 'New member support',
    shortDefinition: 'Help a new member receives after joining, of any kind, from anyone.',
    fullDefinition:
      'Assistance actually given to a new member once they hold a plot, whether practical, ' +
      'social, or emotional, and whether or not any programme arranged it.',
    inclusionCriteria:
      'Apply to help that occurred, including unplanned help from a neighbour and help that ' +
      'changed a decision about staying.',
    exclusionCriteria:
      'Do not apply to the structured introduction a member is given on arrival. Use New ' +
      'member onboarding, which is a separate code with a similar name.',
    synonyms: ['helping newcomers'],
    colorToken: 'code-color-indigo',
  },
  {
    codeId: 'cd-cd0f75',
    parentCodeId: 'cd-4826bd',
    name: 'New member onboarding',
    shortDefinition: 'The arranged introduction: orientation, handbook, mentor pairing.',
    fullDefinition:
      'Provision the garden has designed for arrival, considered as a system, including ' +
      'whether it delivers what it intends.',
    inclusionCriteria:
      'Apply to orientation sessions, written handbooks, assigned mentors, and any evaluation ' +
      'of them.',
    exclusionCriteria:
      'Do not apply to unarranged help from another member. Use New member support, which is ' +
      'a separate code with a similar name.',
    synonyms: ['orientation', 'induction'],
    colorToken: 'code-color-indigo',
  },
  {
    codeId: 'cd-70b1a9',
    parentCodeId: 'cd-d519f8',
    name: 'Mutual aid',
    shortDefinition: 'Members covering for each other in difficulty, often unasked.',
    fullDefinition:
      'Help given during illness, absence, or crisis, including help given anonymously, and ' +
      'the effect of receiving it.',
    inclusionCriteria:
      'Apply where the help responds to hardship rather than to inexperience.',
    exclusionCriteria:
      'Do not apply to routine assistance with a task. Use New member support or Learning ' +
      'from neighbours.',
    synonyms: ['looking after each other'],
    colorToken: 'code-color-indigo',
  },
  {
    codeId: 'cd-e2740c',
    parentCodeId: 'cd-d519f8',
    name: 'Member turnover',
    shortDefinition: 'Members leaving, and accounts of why.',
    fullDefinition:
      'Departures and the explanations offered for them, including explanations the speaker ' +
      'believes the garden has wrong.',
    inclusionCriteria: 'Apply to leaving, not renewing, and to nearly leaving.',
    exclusionCriteria: 'Do not apply to a plot reassigned for a rule breach alone.',
    synonyms: ['attrition', 'not renewing'],
    colorToken: 'code-color-indigo',
  },
  {
    codeId: 'cd-a15d38',
    parentCodeId: 'cd-d519f8',
    name: 'Changing membership composition',
    shortDefinition: 'Shifts in who the members are and what they want from the site.',
    fullDefinition:
      'Differences between longer-standing and newer cohorts, including differing beliefs ' +
      'about what a plot is for and the friction that follows.',
    inclusionCriteria:
      'Apply where two groups of members are contrasted, by tenure, background, or purpose.',
    exclusionCriteria:
      'Do not apply to an individual disagreement with no group framing.',
    synonyms: ['demographic change', 'old and new members'],
    colorToken: 'code-color-indigo',
  },

  /* ---------- 4. Learning and knowledge transfer ---------- */
  {
    codeId: 'cd-45908e',
    parentCodeId: null,
    name: 'Learning and knowledge transfer',
    shortDefinition: 'How gardening knowledge moves between people.',
    fullDefinition:
      'Acquisition of practical knowledge, and the routes by which it travels, from ' +
      'instruction to observation to failure.',
    inclusionCriteria: 'Apply to learning, teaching, and the absence of either.',
    exclusionCriteria:
      'Do not apply to knowledge about rules or history. Use Institutional memory or Rule ' +
      'origin stories.',
    synonyms: ['learning'],
    colorToken: 'code-color-amber',
  },
  {
    codeId: 'cd-c3082f',
    parentCodeId: 'cd-45908e',
    name: 'Informal learning',
    shortDefinition: 'Knowledge picked up outside any organised instruction.',
    fullDefinition:
      'Learning by watching, by being corrected in passing, by asking a neighbour, or by ' +
      'getting something wrong.',
    inclusionCriteria: 'Apply where no session, document, or programme was involved.',
    exclusionCriteria: 'Do not apply to workshops or written material.',
    synonyms: ['picking it up'],
    colorToken: 'code-color-amber',
  },
  {
    codeId: 'cd-90d4c1',
    parentCodeId: 'cd-c3082f',
    name: 'Learning from neighbours',
    shortDefinition: 'Knowledge from the people in adjacent plots.',
    fullDefinition:
      'Teaching by proximity, including indirect styles that leave the decision with the ' +
      'learner, and reflections on how well those styles carry forward.',
    inclusionCriteria:
      'Apply to knowledge that came from a specific other member in the course of gardening.',
    exclusionCriteria: 'Do not apply to help with a task that transferred no knowledge.',
    synonyms: ['the plot next door'],
    colorToken: 'code-color-amber',
  },
  {
    codeId: 'cd-7ef653',
    parentCodeId: 'cd-c3082f',
    name: 'Learning by failure',
    shortDefinition: 'Knowledge acquired by something going wrong.',
    fullDefinition:
      'Crops lost, plans overreached, and seasons misjudged, where the passage frames the ' +
      'failure as instructive.',
    inclusionCriteria: 'Apply where a failure is described and something was drawn from it.',
    exclusionCriteria:
      'Do not apply to failure described only as loss, with nothing learned.',
    synonyms: ['trial and error'],
    colorToken: 'code-color-amber',
  },
  {
    codeId: 'cd-2b6a70',
    parentCodeId: 'cd-45908e',
    name: 'Formal instruction',
    shortDefinition: 'Organised teaching: workshops, handbooks, written guidance.',
    fullDefinition:
      'Knowledge transfer the garden has arranged, and assessments of how it compares with ' +
      'learning in place.',
    inclusionCriteria: 'Apply to sessions, documents, and the shelf of shared references.',
    exclusionCriteria:
      'Do not apply to the orientation considered as an introduction to membership. Use New ' +
      'member onboarding.',
    synonyms: ['taught sessions'],
    colorToken: 'code-color-amber',
  },
  {
    codeId: 'cd-08fd25',
    parentCodeId: 'cd-2b6a70',
    name: 'Workshops',
    shortDefinition: 'Scheduled sessions on a growing topic.',
    fullDefinition:
      'Seasonal teaching sessions, their content, their attendance, and their limits against ' +
      'plot-specific knowledge.',
    inclusionCriteria: 'Apply to any scheduled group session about growing.',
    exclusionCriteria: 'Do not apply to the annual workday, which is common labour.',
    synonyms: ['classes'],
    colorToken: 'code-color-amber',
  },
  {
    codeId: 'cd-63c1ea',
    parentCodeId: 'cd-2b6a70',
    name: 'Written materials',
    shortDefinition: 'Handbooks, notices, newsletters, and shared books.',
    fullDefinition:
      'Documents the garden produces or keeps, including judgements about their quality and ' +
      'their reach.',
    inclusionCriteria: 'Apply to any document referred to as a source of guidance.',
    exclusionCriteria:
      'Do not apply to minutes of meetings, which are records rather than guidance. Use ' +
      'Institutional memory.',
    synonyms: ['handbook', 'notices'],
    colorToken: 'code-color-amber',
  },

  /* ---------- 5. Site governance ---------- */
  {
    codeId: 'cd-fa2916',
    parentCodeId: null,
    name: 'Site governance',
    shortDefinition: 'How the garden is run, and by whom.',
    fullDefinition:
      'Rule making, enforcement, allocation of shared resources, and the durability of ' +
      'decisions over time.',
    inclusionCriteria: 'Apply to committees, meetings, rules, dues, leases, and records.',
    exclusionCriteria: 'Do not apply to expectations enforced socially. Use Informal norms.',
    synonyms: ['administration'],
    colorToken: 'code-color-slate',
  },
  {
    codeId: 'cd-31be04',
    parentCodeId: 'cd-fa2916',
    name: 'Rule making',
    shortDefinition: 'How rules come to exist and who takes part.',
    fullDefinition:
      'The bodies and meetings that produce rules, who attends them, and whose interests the ' +
      'resulting rules reflect.',
    inclusionCriteria: 'Apply to committee composition, elections, meetings, and ratification.',
    exclusionCriteria: 'Do not apply to enforcement of an existing rule.',
    synonyms: ['decision making'],
    colorToken: 'code-color-slate',
  },
  {
    codeId: 'cd-86470b',
    parentCodeId: 'cd-31be04',
    name: 'Participation in decisions',
    shortDefinition: 'Who shows up, and the effect of who does not.',
    fullDefinition:
      'Attendance at meetings and its consequences for whose problems become rules.',
    inclusionCriteria:
      'Apply where the passage links attendance, tenure, or availability to the content of ' +
      'decisions.',
    exclusionCriteria: 'Do not apply to the substance of a rule considered on its own.',
    synonyms: ['who decides'],
    colorToken: 'code-color-slate',
  },
  {
    codeId: 'cd-5c93df',
    parentCodeId: 'cd-fa2916',
    name: 'Rule enforcement',
    shortDefinition: 'Applying rules to members, and the consequences.',
    fullDefinition:
      'Notices, deadlines, reassignment, and exemptions, including cases where enforcement ' +
      'met a circumstance it was not designed for.',
    inclusionCriteria: 'Apply to enforcement events and to accounts of how enforcement feels.',
    exclusionCriteria: 'Do not apply to the making of the rule being enforced.',
    synonyms: ['enforcement'],
    colorToken: 'code-color-slate',
  },
  {
    codeId: 'cd-df6182',
    parentCodeId: 'cd-5c93df',
    name: 'Maintenance deadline',
    shortDefinition: 'The requirement to have a plot planted and kept by a date.',
    fullDefinition:
      'The planting and weeding deadline, its date, its rationale, and recurring arguments ' +
      'about whether it suits members with less time.',
    inclusionCriteria: 'Apply wherever the deadline or its enforcement is discussed.',
    exclusionCriteria: 'Do not apply to other rules enforced on the same notice system.',
    synonyms: ['planting deadline'],
    colorToken: 'code-color-slate',
  },
  {
    codeId: 'cd-1d70e8',
    parentCodeId: 'cd-5c93df',
    name: 'Hardship accommodation',
    shortDefinition: 'Provisions that pause a requirement for a member in difficulty.',
    fullDefinition:
      'Mechanisms that suspend enforcement without requiring disclosure, and the events that ' +
      'produced them.',
    inclusionCriteria:
      'Apply to exemptions, pauses, and the incidents that led to their creation.',
    exclusionCriteria:
      'Do not apply to informal help between members. Use Mutual aid.',
    synonyms: ['hardship pause', 'exemption'],
    colorToken: 'code-color-slate',
  },
  {
    codeId: 'cd-49a0b7',
    parentCodeId: 'cd-fa2916',
    name: 'Water access rules',
    shortDefinition: 'The policy governing when and how members may water.',
    fullDefinition:
      'The watering schedule and its enforcement, formal or social. This is the policy, not ' +
      'the plumbing.',
    inclusionCriteria:
      'Apply to schedules, allocation of watering days, and to disapproval directed at ' +
      'members who depart from them.',
    exclusionCriteria:
      'Do not apply to the physical supply of water. Use Water access, which is a separate ' +
      'code with a similar name.',
    synonyms: ['watering schedule'],
    colorToken: 'code-color-slate',
  },
  {
    codeId: 'cd-0e8534',
    parentCodeId: 'cd-fa2916',
    name: 'Resource allocation',
    shortDefinition: 'How scarce plots and beds are assigned between members.',
    fullDefinition:
      'Allocation of the things there are not enough of, and the competing principles of ' +
      'queue order, tenure, and need.',
    inclusionCriteria:
      'Apply where a passage weighs who should get a scarce resource, including unresolved ' +
      'arguments.',
    exclusionCriteria:
      'Do not apply to the physical characteristics of the resource itself.',
    synonyms: ['who gets what'],
    colorToken: 'code-color-slate',
  },
  {
    codeId: 'cd-cb7e19',
    parentCodeId: 'cd-fa2916',
    name: 'Institutional memory',
    shortDefinition: 'Whether the garden retains why it does what it does.',
    fullDefinition:
      'Records, minutes, handovers, and the loss of reasoning behind past decisions, ' +
      'including the effect on arguments that recur.',
    inclusionCriteria:
      'Apply to retention and loss of organisational knowledge, and to attempts to record it.',
    exclusionCriteria: 'Do not apply to gardening knowledge. Use Learning and knowledge transfer.',
    synonyms: ['organisational memory', 'records'],
    colorToken: 'code-color-slate',
  },
  {
    codeId: 'cd-2705fc',
    parentCodeId: 'cd-cb7e19',
    name: 'Single point of failure',
    shortDefinition: 'A function that stops when one volunteer stops.',
    fullDefinition:
      'Responsibilities held entirely by one person, with no handover, and the functions ' +
      'that lapse when that person leaves or becomes unavailable.',
    inclusionCriteria:
      'Apply where a capability depends on an individual, including where the speaker ' +
      'identifies themselves as one.',
    exclusionCriteria: 'Do not apply to ordinary division of labour with cover in place.',
    synonyms: ['it lived in her head'],
    colorToken: 'code-color-slate',
  },
  {
    codeId: 'cd-63d802',
    parentCodeId: 'cd-cb7e19',
    name: 'Rule origin stories',
    shortDefinition: 'The incident a rule came from, told to explain the rule.',
    fullDefinition:
      'Accounts that attach a history to a rule, and observations that a rule is hard to ' +
      'take seriously without one.',
    inclusionCriteria:
      'Apply where a rule is explained by the event that produced it, or where the absence of ' +
      'that explanation is noted.',
    exclusionCriteria: 'Do not apply to a rule stated without history.',
    synonyms: ['why the rule exists'],
    colorToken: 'code-color-slate',
  },

  /* ---------- 6. Time and seasonality ---------- */
  {
    codeId: 'cd-ae5b71',
    parentCodeId: null,
    name: 'Time and seasonality',
    shortDefinition: 'How the season and the calendar shape the work.',
    fullDefinition:
      'The distribution of effort across a year, and the ways time available and time ' +
      'required fail to line up.',
    inclusionCriteria: 'Apply to time, timing, seasons, and workload.',
    exclusionCriteria:
      'Do not apply to the maintenance deadline as a rule. Use Maintenance deadline.',
    synonyms: ['seasonality', 'time'],
    colorToken: 'code-color-rust',
  },
  {
    codeId: 'cd-d20f96',
    parentCodeId: 'cd-ae5b71',
    name: 'Planning versus reality',
    shortDefinition: 'The gap between a plan made off-season and the season itself.',
    fullDefinition:
      'Plans made when time feels abundant, measured against the conditions in which the work ' +
      'is actually done.',
    inclusionCriteria:
      'Apply where two versions of the same gardener are compared, or where over-planting is ' +
      'described.',
    exclusionCriteria: 'Do not apply to a plan that was carried out as intended.',
    synonyms: ['February gardener'],
    colorToken: 'code-color-rust',
  },
  {
    codeId: 'cd-7c40a3',
    parentCodeId: 'cd-ae5b71',
    name: 'Seasonal peak load',
    shortDefinition: 'The period when the work cannot be deferred.',
    fullDefinition:
      'Stretches, typically midsummer, when watering and harvesting compress and falling ' +
      'behind cannot be recovered.',
    inclusionCriteria:
      'Apply where the passage marks a period of concentrated or inflexible work.',
    exclusionCriteria: 'Do not apply to general statements about hours per week.',
    synonyms: ['July', 'the crunch'],
    colorToken: 'code-color-rust',
  },
  {
    codeId: 'cd-fb1c58',
    parentCodeId: 'cd-ae5b71',
    name: 'Time commitment',
    shortDefinition: 'Hours a plot requires, and how they are fitted around other life.',
    fullDefinition:
      'Quantities of time, the scheduling of it around work and care, and choices about when ' +
      'to be on site.',
    inclusionCriteria: 'Apply to stated hours, routines, and the arranging of them.',
    exclusionCriteria:
      'Do not apply to the peak period specifically. Use Seasonal peak load.',
    synonyms: ['hours', 'fitting it in'],
    colorToken: 'code-color-rust',
  },
  {
    codeId: 'cd-52e6da',
    parentCodeId: 'cd-ae5b71',
    name: 'Abandonment point',
    shortDefinition: 'The moment a member comes closest to giving up the plot.',
    fullDefinition:
      'Low points in a season where continuing is in question, and whatever tipped the ' +
      'decision either way.',
    inclusionCriteria:
      'Apply where quitting is considered, whether or not the member left, including ' +
      'second-hand accounts of when others quit.',
    exclusionCriteria:
      'Do not apply to a departure with no described deliberation. Use Member turnover.',
    synonyms: ['the month everyone quits'],
    colorToken: 'code-color-rust',
  },
];

export const codes: Code[] = codesInCanonicalOrder.map((code, index) => ({
  ...code,
  projectId: PROJECT_ID,
  examples: [],
  status: 'approved',
  canonicalOrderIndex: index,
}));

export const codebookVersion: CodebookVersion = {
  codebookVersionId: CODEBOOK_VERSION_ID,
  projectId: PROJECT_ID,
  versionLabel: 'v1.0, frozen for round 1',
  createdAt: '2026-05-28T00:00:00.000Z',
  codeIds: codes.map((code) => code.codeId),
};

export const codeById = new Map(codes.map((code) => [code.codeId, code]));
