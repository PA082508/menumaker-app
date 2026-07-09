-- Staff Job-Description acknowledgments — seed the verbatim JD texts into the
-- versioned policy_documents registry (the source of truth both signing surfaces
-- bind to). SURFACE = IN-APP: SignModal renders the body + adds the acknowledgment
-- line and fields (Name print / Signature / Date). Bodies here are JD TEXT ONLY —
-- acknowledgment tails are NOT stored in the text (SignModal/pattern adds them).
--
-- §2 role → exactly one JD document (1:1, per-role — "floater gets both" is CLOSED):
--   teacher assistant → Staff_JD_TeacherAssistant  (DOC 1, verbatim)
--   floater           → Staff_Floater_Takeover     (DOC 2, verbatim)
--   teacher           → Staff_JD_Teacher            (DOC 3, VERSION B childcare-adapted)
--   cook/driver/office/director → added as records arrive; NO form-kit change needed.
--
-- key + '_' + version = Nikolay's identifiers (Staff_JD_Teacher_v1, …).
-- Source of truth for the text is Nikolay's 2026-07-09 full re-send (this seed matches it).
--
-- Applied to project menumaker (trrmyqfpxntmgxnqkikp) 2026-07-09.

-- ── DOC 1 · Teacher Assistant JD (verbatim; ack line/fields added by SignModal) ─
insert into menumaker.policy_documents
  (org_id, key, version, title, body, status, effective_date, announced_at, activated_at)
values (
  '3a9a290e-7e49-491e-946b-ad86f2399910',
  'Staff_JD_TeacherAssistant', 'v1',
  'Teacher Assistant — Job Description',
  $body$**Position Title:** Teacher Assistant

**Purpose of Position:** To provide instructional and clerical support for classroom teachers, allowing teachers more time for lesson planning and teaching. To support and assist children in learning class material using the teacher's lesson plans, providing students with individualized attention.

**DUTIES AND RESPONSIBILITIES**

- Meet the needs of all children; including those who are at risk, those with special needs, those who are gifted, and those who are culturally diverse.
- Assisting in the implementation of the daily program under the direction of the teacher.
- Follow daily routine, which includes small and large group experiences, choice time, music and movement, large and small motor activities, skill development, meals, and effective transitions between activities.
- Encourage experimentation, exploration, problem solving, cooperation, socialization, and choice-making; ask open-ended questions and listen respectfully to the answers.
- Support language development by talking to children of all ages during any daily routine.
- Provide an atmosphere that promotes and reinforces parental involvement in the classroom: report to the family about child's day during the departure time (verbally and written daily report if applicable); always welcoming attitude towards any family members.
- Supervise and monitor children at all times. No talking on the phone or engaging into the long conversations or other activities that will distract from adequate supervision. This can be grounds for dismissal from the job. Phones cannot be out while you are responsible for children.
- Accommodate the eating, sleeping, and bodily care cycles of each child following communicable disease requirements and proper hand washing and diapering procedures and Food Program guidelines. Children should have a clean appearance. (Clean face, clean clothes and hands)
- Classroom should be kept clean and orderly. All items should be put away each day. Make sure that the room is clean each evening. Use weak bleach to spray down toys, tables, chairs, bathroom as needed throughout the day.
- Respond to crisis or emergency situations that may occur. Provide first aid or CPR, prevent the spread of blood borne pathogens, and access emergency services as needed.
- Attend meetings, trainings, and appropriate professional development activities.
- Assure general maintenance and security of facility.
- Assist in inventory of all site equipment.
- Other duties as requested.
- Be on time. You should be to work and ready in the classroom at the approved time.
- If you cannot come to work, you must call the administrator right away and tell them why you cannot come in. Please give two weeks notice if you need time off and are not available to work.$body$,
  'active', current_date, now(), now()
)
on conflict (org_id, key, version) do nothing;

-- ── DOC 2 · Floater Teacher JD When Taking Over the Classroom (verbatim) ───────
-- Paper tail was only Name/Date; e-version gets the standard pattern tail
-- (Name print from §1 + Signature + Date) — SignModal adds it. New edition, upgrade OK.
insert into menumaker.policy_documents
  (org_id, key, version, title, body, status, effective_date, announced_at, activated_at)
values (
  '3a9a290e-7e49-491e-946b-ad86f2399910',
  'Staff_Floater_Takeover', 'v1',
  'Floater Teacher — Job Description When Taking Over the Classroom',
  $body$**Floater Teacher's Job Descriptions When Taking Over The Classroom**

1. Making sure to count and "name to face" each of the children in the classroom.
2. Checking through information at the back of the binder and being aware of each child's special needs such as, allergies, medical and diagnostic conditions, medications, specific emergency treatment, etc.
3. Making sure that each of the children is being sign-in or out of the roster.
4. Never leave the classroom and the children unattended (call for help if you need anything).

**During Nap Time**

5. "Safe-Sleep Awareness" — Babies under age 1 should be sleeping on their back. No blankets, no toys — soft or hard, bib should be removed, do not hang anything on the crib while the baby is in it. While each of the babies is asleep, walk around the crib and check on the rising and the falling of their chest, making sure each one is breathing normally.
6. Children 1 and older — making sure children's faces are exposed while sleeping.
7. Ask a lead teacher if there's anything you can do in the classroom while the children are asleep.$body$,
  'active', current_date, now(), now()
)
on conflict (org_id, key, version) do nothing;

-- ── DOC 3 · Teacher JD — VERSION B (childcare-adapted, Nikolay's choice) ───────
insert into menumaker.policy_documents
  (org_id, key, version, title, body, status, effective_date, announced_at, activated_at)
values (
  '3a9a290e-7e49-491e-946b-ad86f2399910',
  'Staff_JD_Teacher', 'v1',
  'Teacher — Job Description',
  $body$**Position Summary**

A Teacher is responsible for planning, preparing, and delivering engaging, age-appropriate lessons and activities that promote children's academic, social, and emotional development. Teachers create a positive learning environment, observe and document each child's progress, and collaborate with parents, colleagues, and center administrators to support every child's success.

**Key Responsibilities**

- Plan and deliver effective, age-appropriate lessons aligned with the curriculum.
- Create a safe, inclusive, and supportive classroom environment.
- Observe, monitor, and document each child's developmental progress.
- Prepare lesson plans, teaching materials, and classroom activities.
- Guide classroom behavior using positive, age-appropriate discipline strategies.
- Encourage critical thinking, creativity, and problem-solving skills.
- Provide individual support to children with different learning needs.
- Maintain accurate child records and attendance.
- Communicate regularly with parents or guardians regarding each child's progress.
- Participate in staff meetings, professional development, and center events.
- Supervise children at all times — during activities, meals, rest time, outdoor play, and outings.
- Ensure compliance with center policies, procedures, Ohio licensing requirements, and safety regulations.

**Key Skills**

Communication and presentation skills · Classroom management · Lesson planning · Child observation and assessment · Time management · Problem-solving · Teamwork and collaboration · Adaptability and creativity · Patience and empathy

**Working Conditions**

Work is performed primarily in classrooms and center environments. May involve supervising outdoor play and attending center events. Requires standing, walking, lifting or carrying young children, and interacting with children for extended periods.

**Performance Expectations**

Maintain high standards of teaching and care. Support children in reaching their developmental goals. Foster positive relationships with children, parents, and colleagues. Continuously improve teaching practices through professional development.$body$,
  'active', current_date, now(), now()
)
on conflict (org_id, key, version) do nothing;
