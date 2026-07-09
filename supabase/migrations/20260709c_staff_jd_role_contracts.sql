-- Staff JD role contracts (Increment 1.5) — 8 role-specific Job Descriptions.
-- Source: 8 role contracts supplied by owner 2026-07-09, Fwd_ Duties and
-- Responsibilities/*.docx (docx originals kept in Nikolay's archive, NOT in repo;
-- source of truth is now policy_documents + this migration).
-- Extracted verbatim, with ONLY systemic/agency term edits per Nikolay:
--   "Smart Care"/"Smartcare"/"Parent Post" → "the center's management system" (no product hardcode)
--   "ODJFS" → "Ohio Department of Children and Youth (DCY)" ("… Licensing Rules" → "Ohio DCY licensing rules")
--   ack grammar "as a Assistant" → "as an Assistant"
-- Pedagogical terms + people's names untouched (High-Scope, Cinci, SUTQ, ASQ, COR,
-- Applewood/TAP/CEVEC, "to Tatiana"). Bodies = Purpose + DUTIES (+ weekly-checklist
-- paragraph verbatim where present); ack line + signature lines are NOT in body
-- (SignModal adds the ack line; Employee/Date/Administrator sig lines dropped —
-- Administrator counter-signature is not implemented, its role = director Approve).
-- Contract_infant-toddler_assistant_KK.docx excluded (personal edition, out of registry).
--
-- Also RETIRE the two generic teaching JDs from Increment 1 — every teaching role
-- is now covered by a precise per-age-group doc: Staff_JD_Teacher (v1, version B) and
-- Staff_JD_TeacherAssistant (v1). status active → retired. Staff_Floater_Takeover STAYS.
--
-- Applied to project menumaker (trrmyqfpxntmgxnqkikp) 2026-07-09.


insert into menumaker.policy_documents
  (org_id, key, version, title, body, status, effective_date, announced_at, activated_at)
values (
  '3a9a290e-7e49-491e-946b-ad86f2399910',
  'Staff_JD_Director', 'v1',
  'Director — Job Description',
  $body$**Responsible to:** Owner
**Purpose of Position:**
Provide a successful, safe and supervised educational setting for children while they are in Play Academy environment. Promote social, emotional, physical, and cognitive development of all children. Encourage parent involvement in all aspects of the program. To follow Play Academy mission and vision statement to provide a center of quality.
**DUTIES AND RESPONSIBILITIES**
- Monitor and maintain daily activities of all staff. Ensure all lead and assistant teachers are completing their weekly requirements as stated on their contract.

- Ensure High Scope and Cinci curriculum is implemented throughout the classrooms and being followed on the weekly activity plans.

- Schedule parent conferences each fall and spring and any additional meetings that may be needed.

- Work with appropriate agencies in developing specialized planning for children/families as needed. These consist of Applewood, TAP, CEVEC, local school district, and any additional that provides services to young children.

- Responsible for creating and printing attendance each week and submitting voucher payments.

- Check email (gmail) and through website, each day several times per day and immediately respond. Email through the center's management system on a weekly basis to ensure communication and relationships with all families.

- Complete all SUTQ requirements on an ongoing basis to always meet 5 star expectations.

- Make sure there is enough staff members at all times to maintain state ratios.

- Schedule tours and follow enrollment procedures when interest to center is shown. Enroll into center as much as possible to ensure center is at full capacity.

- Create daily schedule for staff to follow and make sure they are following the schedule given.

- Monitor staff hours and submit payroll no later than Tuesday of the pay week to Tatiana.

- Keep the center's management system information and billing up to date. Monitor payments as they are/are not received.

- Maintain Ohio DCY licensing rules at all times.

- Support language development by allowing several hours per week for a Spanish and Russian teachers to be in the infant classrooms.

- Ensure supervision and monitor children at all times is taking place for all staff members.

- Ensure classrooms are kept clean and orderly. Monitor classroom activities and materials to ensure all classrooms are meeting the developmental and intellectual needs of the children they are serving.

- Respond to crisis or emergency situations that may occur. Provide first aid or CPR, prevent the spread of blood borne pathogens, and access emergency services as needed. Fill out paperwork for each incident that you have to perform first aid.  Make sure that parents are notified.

- Develop staff meetings when needed; send staff to OCCRRA trainings and appropriate professional development activities.

- Assure general maintenance and security of facility.

- Assist in inventory of all site equipment.

- Other duties as requested.$body$,
  'active', current_date, now(), now()
)
on conflict (org_id, key, version) do nothing;

insert into menumaker.policy_documents
  (org_id, key, version, title, body, status, effective_date, announced_at, activated_at)
values (
  '3a9a290e-7e49-491e-946b-ad86f2399910',
  'Staff_JD_DirectorHelper', 'v1',
  'Director Helper — Job Description',
  $body$**Responsible to:** Director
**Purpose of Position:**
Provide a successful, safe and supervised educational setting for children while they are in Play Academy environment. Promote social, emotional, physical, and cognitive development of all children. Encourage parent involvement in all aspects of the program. To follow Play Academy mission and vision statement to provide a center of quality.
**DUTIES AND RESPONSIBILITIES**
- Respond promptly to all Director requests.

- Report any information heard by employees or families immediately and authentically to Director.

- Greet every person that walks through the door

- Direct any parents with concerns to Director.

- Upon enrollment ensure all paperwork is submitted for children and continued to be updated on the required basis as well as entered into the center's management system.

- Create ASQ binders and all requirement paperwork for new children within 30 days of starting.

- Ensure all classrooms have updated photos and allergy/preferences for all children.

- Responsible for copying weekly attendance and place it in owners pile.

- Check voicemail each morning and answer all phone calls when on the clock.

- Schedule tours or other meeting for Theresa using the office calendar regardless of availability of the center.

- Assist Director in maintain Ohio DCY licensing rules and SUTQ 5 star requirements.

- Step into classroom for bathroom breaks and to meet ratio as needed.

- Assist in making sure all staff members are following daily schedule.

- Maintain Ohio DCY licensing rules at all times.

- Support language development by covering several hours per week for a Spanish teacher to be in the infant classrooms.

- Drive bus as needed.

- Ensure supervision and monitor children at all times is taking place for all staff members.

- Ensure classrooms are kept clean and orderly.

- Respond to crisis or emergency situations that may occur. Provide first aid or CPR, prevent the spread of blood borne pathogens, and access emergency services as needed. Fill out paperwork for each incident that you have to perform first aid.  Make sure that parents are notified.

- Assure general maintenance and security of facility.

- Other duties as requested.$body$,
  'active', current_date, now(), now()
)
on conflict (org_id, key, version) do nothing;

insert into menumaker.policy_documents
  (org_id, key, version, title, body, status, effective_date, announced_at, activated_at)
values (
  '3a9a290e-7e49-491e-946b-ad86f2399910',
  'Staff_JD_InfantToddlerLead', 'v1',
  'Lead Teacher (Infant/Toddler) — Job Description',
  $body$**Responsible to:** Director
**Purpose of Position:**
Provide a successful, safe and supervised educational setting for children while they are in Play Academy environment. Promote social, emotional, physical, and cognitive development of all children. Encourage parent involvement in all aspects of the program.  To develop individual goals for children, provide on-going assessment of progress and facilitate transition into the following classroom.
**DUTIES AND RESPONSIBILITIES**
- Develop and utilize lesson plans, which reflect mandated elements, parental and cultural influences according to the State of Ohio standards and promote the social, emotional, physical, and cognitive development of the children.

- Follow High-Scope curriculum and individualize instruction to reflect the unique needs and strengths of all children in the classroom. Instruction includes one-to-one, small group and large group activities.

- Use Ages & Stages Questionnaires as an assessment tool to screen every child within 60 days of enrollment and annually as well as discuss results with families. If referral is needed, report to administrator to allow parent conference to be held within 90 days of enrollment.

- Complete 2-3 weekly observations for every child using Child Observation Record (online COR). Create family reports at the end of each online COR period and discuss them with families during parent-teacher conferences.

- Ensure each child in the classroom has a binder portfolio and the records are updated on a regular basis. (see sample portfolio in office for all required documentation)

- Work with appropriate agencies in developing specialized planning for children/families as needed. Coordinate with special needs consultants in the classroom and develop a collaborative approach that benefits all children in the classroom and meets needs as specified on the individual plans.

- Delegate responsibilities in the classroom. Verbalize to other teachers in the room when leaving room for planning time, breaks or leaving for the day.

- Responsible for proper attendance and meal count paperwork.

- Complete annual professional development plan and teacher assistant assessment.

- Use the center's management system to post at least 2-3 times per week to parents in order to continue communication and a close relationship with families.

- Develop and implement monthly family involvement activities.

- Meet the needs of all children; including those who are at risk, those with special needs, those who are gifted, and those who are culturally diverse.

- Follow daily routine, which includes small and large group experiences, free choice time, music and movement, large and small motor activities, skill development, meals, and effective transitions between activities.

- Encourage experimentation, exploration, problem solving, cooperation, socialization, and choice-making; ask open-ended questions and listen respectfully to the answers.

- Provide an atmosphere that promotes and reinforces parental involvement in the classroom:
  - report to the family about child’s day during the departure time (verbally or via a report in the center's management system)
  - always welcoming attitude towards any family members.

- Complete the daily sheets for families and make sure parents know what items are needed at the center when supplies are running low.

- Support language development by talking to the infants and toddlers during all daily routines.

- Supervise and monitor children at all times. No talking or texting on the phone or engaging in long conversations or other activities that will distract you from adequate supervision.

- Understand that if children are left alone under your care, you will be written up and could lose your job.

- Monitor your classroom at all times. Be on the same level with children to observe and interact with them. When your children are in the gym or outside, you should be up and walking around the play area. You should never be sitting down during active play.

- Accommodate the eating and bodily care cycles of each child following communicable disease requirements and proper hand washing and Food Program guidelines.  Children should have a clean appearance. (Clean face, clean clothes and hands)

- Classroom should be kept clean and orderly.  All items should be put away each day.  Make sure that the room is clean each evening.  Use weak bleach to spray down toys, tables, chairs, bathroom as needed throughout the day.

- Respond to crisis or emergency situations that may occur. Provide first aid or CPR, prevent the spread of blood borne pathogens, and access emergency services as needed. Fill out paperwork for each incident that you have to perform first aid.  Make sure that parents are notified.

- Attend meetings, trainings, and appropriate professional development activities.

- Assure general maintenance and security of facility.

- Assist in inventory of all site equipment.

- Other duties as requested.

In order to verify my compliance with all of the duties and responsibilities, the Administrator will perform weekly checklists. Every line of that list must be checked "yes" as an absolute minimum of your position requirements. Unsatisfactory weekly checklists could result in the probation and release of duties.$body$,
  'active', current_date, now(), now()
)
on conflict (org_id, key, version) do nothing;

insert into menumaker.policy_documents
  (org_id, key, version, title, body, status, effective_date, announced_at, activated_at)
values (
  '3a9a290e-7e49-491e-946b-ad86f2399910',
  'Staff_JD_InfantToddlerAssistant', 'v1',
  'Assistant Teacher (Infant/Toddler) — Job Description',
  $body$**Responsible to:** Director
**Purpose of Position:**
Provide a successful, safe and supervised educational setting for children while they are in Play Academy environment. Promote social, emotional, physical, and cognitive development of all children. Encourage parent involvement in all aspects of the program.  To develop individual goals for children, provide on-going assessment of progress and facilitate transition into the following classroom.
**DUTIES AND RESPONSIBILITIES**
- Assist lead in developing and utilizing lesson plans, which reflect mandated elements, parental and cultural influences according to the State of Ohio standards and promote the social, emotional, physical, and cognitive development of the children.

- Follow High-Scope curriculum and individualize instruction to reflect the unique needs and strengths of all children in the classroom. Instruction includes one-to-one, small group and large group activities.

- Assist in using Ages & Stages Questionnaires as an assessment tool to screen every child within 60 days of enrollment and annually as well as discuss results with families. If referral is needed, report to administrator to allow parent conference to be held within 90 days of enrollment.

- Assist in completing 2-3 weekly observations for every child using Child Observation Record (online COR). Create family reports at the end of each online COR period and discuss them with families during parent-teacher conferences.

- Assist in ensuring each child in the classroom has a binder portfolio and the records are updated on a regular basis. (see sample portfolio in office for all required documentation)

- Assist in working with appropriate agencies in developing specialized planning for children/families as needed. Coordinate with special needs consultants in the classroom and develop a collaborative approach that benefits all children in the classroom and meets needs as specified on the individual plans.

- Responsible for proper attendance and meal count paperwork.

- Use the center's management system to post at least 2-3 times per week to parents in order to continue communication and a close relationship with families.

- Develop and implement monthly family involvement activities.

- Meet the needs of all children; including those who are at risk, those with special needs, those who are gifted, and those who are culturally diverse.

- Follow daily routine, which includes small and large group experiences, free choice time, music and movement, large and small motor activities, skill development, meals, and effective transitions between activities.

- Encourage experimentation, exploration, problem solving, cooperation, socialization, and choice-making; ask open-ended questions and listen respectfully to the answers.

- Assist in providing an atmosphere that promotes and reinforces parental involvement in the classroom:
  - report to the family about child’s day during the departure time (verbally or via a report in the center's management system)
  - always welcoming attitude towards any family members.

- Assist in completing the daily sheets for families and make sure parents know what items are needed at the center when supplies are running low.

- Support language development by talking to the infants and toddlers during all daily routines.

- Communicate with other staff members in the classroom regarding schedule changes, breaks or relief of shift.

- Supervise and monitor children at all times. No talking or texting on the phone or engaging in long conversations or other activities that will distract you from adequate supervision.

- Understand that if children are left alone under your care, you will be written up and could lose your job.

- Monitor your classroom at all times. Be on the same level with children to observe and interact with them. When your children are in the gym or outside, you should be up and walking around the play area. You should never be sitting down during active play.

- Accommodate the eating and bodily care cycles of each child following communicable disease requirements and proper hand washing and Food Program guidelines.  Children should have a clean appearance. (Clean face, clean clothes and hands)

- Classroom should be kept clean and orderly.  All items should be put away each day.  Make sure that the room is clean each evening.  Use weak bleach to spray down toys, tables, chairs, bathroom as needed throughout the day.

- Respond to crisis or emergency situations that may occur. Provide first aid or CPR, prevent the spread of blood borne pathogens, and access emergency services as needed. Fill out paperwork for each incident that you have to perform first aid.  Make sure that parents are notified.

- Attend meetings, trainings, and appropriate professional development activities.

- Assure general maintenance and security of facility.

- Assist in inventory of all site equipment.

- Other duties as requested.$body$,
  'active', current_date, now(), now()
)
on conflict (org_id, key, version) do nothing;

insert into menumaker.policy_documents
  (org_id, key, version, title, body, status, effective_date, announced_at, activated_at)
values (
  '3a9a290e-7e49-491e-946b-ad86f2399910',
  'Staff_JD_PreschoolLead', 'v1',
  'Lead Teacher (Preschool/Pre-K) — Job Description',
  $body$**Responsible to:** Director
**Purpose of Position:**
Provide a successful, safe and supervised educational setting for children while they are in Play Academy environment. Promote social, emotional, physical, and cognitive development of all children. Encourage parent involvement in all aspects of the program.  To develop individual goals for children, provide on-going assessment of progress and facilitate transition into the following classroom.
**DUTIES AND RESPONSIBILITIES**
- Develop and utilize lesson plans, which reflect mandated elements, parental and cultural influences according to the State of Ohio standards and promote the social, emotional, physical, and cognitive development of the children.

- Follow High-Scope curriculum and individualize instruction to reflect the unique needs and strengths of all children in the classroom. Instruction includes one-to-one, small group and large group activities.

- Use Ages & Stages Questionnaires as an assessment tool to screen every child within 60 days of enrollment and annually as well as discuss results with families. If referral is needed, report to administrator to allow parent conference to be held within 90 days of enrollment.

- Complete 2-3 weekly observations for every child using Child Observation Record (online COR). Create family reports at the end of each online COR period and discuss them with families during parent-teacher conferences.

- Ensure each child in the classroom has a binder portfolio and the records are updated on a regular basis. (see sample portfolio in office for all required documentation)

- Work with appropriate agencies in developing specialized planning for children/families as needed. Coordinate with special needs consultants in the classroom and develop a collaborative approach that benefits all children in the classroom and meets needs as specified on the individual plans.

- Use the center's management system to post at least 2-3 times per week to parents in order to continue communication and a close relationship with families.

- Develop and implement monthly family involvement activities.

- Responsible for proper attendance and meal count paperwork.

- Complete annual professional development plan and teacher assistant assessment.

- Meet the needs of all children; including those who are at risk, those with special needs, those who are gifted, and those who are culturally diverse.

- Follow daily routine, which includes small and large group experiences, free choice time, music and movement, large and small motor activities, skill development, meals, and effective transitions between activities.

- Encourage experimentation, exploration, problem solving, cooperation, socialization, and choice-making; ask open-ended questions and listen respectfully to the answers.

- Provide an atmosphere that promotes and reinforces parental involvement in the classroom:
  - report to the family about child’s day during the departure time (verbally or via a report in the center's management system)
  - always welcoming attitude towards any family members.

- Supervise and monitor children at all times. No talking or texting on the phone or engaging in long conversations or other activities that will distract you from adequate supervision.

- Understand that if children are left alone under your care, you will be written up and could lose your job.

- Monitor your classroom at all times. Be on the same level with children to observe and interact with them. When your children are in the gym or outside, you should be up and walking around the play area. You should never be sitting down during active play.

- Delegate responsibilities in the classroom. Verbalize to other teachers in the room when leaving room for planning time, breaks or leaving for the day.

- Accommodate the eating and bodily care cycles of each child following communicable disease requirements and proper hand washing and Food Program guidelines.  Children should have a clean appearance. (Clean face, clean clothes and hands)

- Classroom should be kept clean and orderly.  All items should be put away each day.  Make sure that the room is clean each evening.  Use weak bleach to spray down toys, tables, chairs, bathroom as needed throughout the day.

- Respond to crisis or emergency situations that may occur. Provide first aid or CPR, prevent the spread of blood borne pathogens, and access emergency services as needed. Fill out paperwork for each incident that you have to perform first aid.  Make sure that parents are notified.

- Attend meetings, trainings, and appropriate professional development activities.

- Assure general maintenance and security of facility.

- Assist in inventory of all site equipment.

- Other duties as requested.

In order to verify my compliance with all of the duties and responsibilities, the Administrator will perform weekly checklists. Every line of that list must be checked "yes" as an absolute minimum of your position requirements. Unsatisfactory weekly checklists could result in the probation and release of duties.$body$,
  'active', current_date, now(), now()
)
on conflict (org_id, key, version) do nothing;

insert into menumaker.policy_documents
  (org_id, key, version, title, body, status, effective_date, announced_at, activated_at)
values (
  '3a9a290e-7e49-491e-946b-ad86f2399910',
  'Staff_JD_PreschoolAssistant', 'v1',
  'Assistant Teacher (Preschool/Pre-K) — Job Description',
  $body$**Responsible to:** Director
**Purpose of Position:**
Provide a successful, safe and supervised educational setting for children while they are in Play Academy environment. Promote social, emotional, physical, and cognitive development of all children. Encourage parent involvement in all aspects of the program.  To develop individual goals for children, provide on-going assessment of progress and facilitate transition into the following classroom.
**DUTIES AND RESPONSIBILITIES**
- Assist Lead in developing and utilize lesson plans, which reflect mandated elements, parental and cultural influences according to the State of Ohio standards and promote the social, emotional, physical, and cognitive development of the children.

- Follow High-Scope curriculum and individualize instruction to reflect the unique needs and strengths of all children in the classroom. Instruction includes one-to-one, small group and large group activities.

- Assist in using Ages & Stages Questionnaires as an assessment tool to screen every child within 60 days of enrollment and annually as well as discuss results with families. If referral is needed, report to administrator to allow parent conference to be held within 90 days of enrollment.

- Assist in completing 2-3 weekly observations for every child using Child Observation Record (online COR). Create family reports at the end of each online COR period and discuss them with families during parent-teacher conferences.

- Assist in ensuring each child in the classroom has a binder portfolio and the records are updated on a regular basis. (see sample portfolio in office for all required documentation)

- Assist in working with appropriate agencies in developing specialized planning for children/families as needed. Coordinate with special needs consultants in the classroom and develop a collaborative approach that benefits all children in the classroom and meets needs as specified on the individual plans.

- Responsible for proper attendance and meal count paperwork.

- Complete annual professional development plan and teacher assistant assessment.

- Meet the needs of all children; including those who are at risk, those with special needs, those who are gifted, and those who are culturally diverse.

- Follow daily routine, which includes small and large group experiences, free choice time, music and movement, large and small motor activities, skill development, meals, and effective transitions between activities.

- Encourage experimentation, exploration, problem solving, cooperation, socialization, and choice-making; ask open-ended questions and listen respectfully to the answers.

- Assist in providing an atmosphere that promotes and reinforces parental involvement in the classroom:
  - report to the family about child’s day during the departure time (verbally or via a report in the center's management system)
  - always welcoming attitude towards any family members.

- Supervise and monitor children at all times. No talking or texting on the phone or engaging in long conversations or other activities that will distract you from adequate supervision.

- Understand that if children are left alone under your care, you will be written up and could lose your job.

- Monitor your classroom at all times. Be on the same level with children to observe and interact with them. When your children are in the gym or outside, you should be up and walking around the play area. You should never be sitting down during active play.

- Accommodate the eating and bodily care cycles of each child following communicable disease requirements and proper hand washing and Food Program guidelines.  Children should have a clean appearance. (Clean face, clean clothes and hands)

- Classroom should be kept clean and orderly.  All items should be put away each day.  Make sure that the room is clean each evening.  Use weak bleach to spray down toys, tables, chairs, bathroom as needed throughout the day.

- Respond to crisis or emergency situations that may occur. Provide first aid or CPR, prevent the spread of blood borne pathogens, and access emergency services as needed. Fill out paperwork for each incident that you have to perform first aid.  Make sure that parents are notified.

- Attend meetings, trainings, and appropriate professional development activities.

- Assure general maintenance and security of facility.

- Assist in inventory of all site equipment.

- Other duties as requested.

In order to verify my compliance with all of the duties and responsibilities, the Administrator will perform weekly checklists. Every line of that list must be checked "yes" as an absolute minimum of your position requirements. Unsatisfactory weekly checklists could result in the probation and release of duties.$body$,
  'active', current_date, now(), now()
)
on conflict (org_id, key, version) do nothing;

insert into menumaker.policy_documents
  (org_id, key, version, title, body, status, effective_date, announced_at, activated_at)
values (
  '3a9a290e-7e49-491e-946b-ad86f2399910',
  'Staff_JD_SchoolAgeLead', 'v1',
  'Lead Teacher (School-Age) — Job Description',
  $body$**Responsible to:** Director
**Purpose of Position:**
Provide a successful, safe and supervised educational setting for children while they are in Play Academy environment. Promote social, emotional, physical, and cognitive development of all children. Encourage parent involvement in all aspects of the program.  To develop individual goals for children, provide on-going assessment of progress and facilitate transition into the following classroom.
**DUTIES AND RESPONSIBILITIES**
- Develop and utilize lesson plans, which reflect mandated elements, parental and cultural influences according to the State of Ohio standards and promote the social, emotional, physical, and cognitive development of the children.

- Use Cinci after school curriculum and assessments for lesson planning. Children will choose what hey like and would like to work on through assessments.

- Responsible for proper attendance and meal count paperwork.

- Complete 2 weekly informal observations for every child and keep work samples as evidence of observation.

- Drive the bus daily to pick up children from school and field trips as needed.

- Create a way to communicate with parents on projects, homework, and other activities.

- Use the center's management system to post at least 2-3 times per week to parents in order to continue communication and a close relationship with families.

- Develop and implement monthly family involvement activities.

- Help with homework. Check with parents with what your role is.

- Work with appropriate agencies in developing specialized planning for children/families as needed. Coordinate with special needs consultants in the classroom and develop a collaborative approach that benefits all children in the classroom and meets needs as specified on the individual plans.

- Delegate responsibilities in the classroom. Verbalize to other teachers in the room when leaving room for planning time, breaks or leaving for the day.

- Responsible for proper attendance and meal count paperwork.

- Complete annual professional development plan and teacher assistant assessment.

- Meet the needs of all children; including those who are at risk, those with special needs, those who are gifted, and those who are culturally diverse.

- Follow daily routine, which includes small and large group experiences, free choice time, music and movement, large and small motor activities, skill development, meals, and effective transitions between activities.

- Encourage experimentation, exploration, problem solving, cooperation, socialization, and choice-making; ask open-ended questions and listen respectfully to the answers.

- Provide an atmosphere that promotes and reinforces parental involvement in the classroom:
  - report to the family about child’s day during the departure time (verbally or via a report in the center's management system)
  - always welcoming attitude towards any family members.

- Supervise and monitor children at all times. No talking or texting on the phone or engaging in long conversations or other activities that will distract you from adequate supervision.

- Understand that if children are left alone under your care, you will be written up and could lose your job.

- Monitor your classroom at all times. Be on the same level with children to observe and interact with them. When your children are in the gym or outside, you should be up and walking around the play area. You should never be sitting down during active play.

- Accommodate the eating and bodily care cycles of each child following communicable disease requirements and proper hand washing and Food Program guidelines.  Children should have a clean appearance. (Clean face, clean clothes and hands)

- Classroom should be kept clean and orderly.  All items should be put away each day.  Make sure that the room is clean each evening.  Use weak bleach to spray down toys, tables, chairs, bathroom as needed throughout the day.

- Respond to crisis or emergency situations that may occur. Provide first aid or CPR, prevent the spread of blood borne pathogens, and access emergency services as needed. Fill out paperwork for each incident that you have to perform first aid.  Make sure that parents are notified.

- Attend meetings, trainings, and appropriate professional development activities.

- Assure general maintenance and security of facility.

- Assist in inventory of all site equipment.

- Other duties as requested.

In order to verify my compliance with all of the duties and responsibilities, the Administrator will perform weekly checklists. Every line of that list must be checked "yes" as an absolute minimum of your position requirements. Unsatisfactory weekly checklists could result in the probation and release of duties.$body$,
  'active', current_date, now(), now()
)
on conflict (org_id, key, version) do nothing;

insert into menumaker.policy_documents
  (org_id, key, version, title, body, status, effective_date, announced_at, activated_at)
values (
  '3a9a290e-7e49-491e-946b-ad86f2399910',
  'Staff_JD_SchoolAgeAssistant', 'v1',
  'Assistant Teacher (School-Age) — Job Description',
  $body$**Responsible to:** Director
**Purpose of Position:**
Provide a successful, safe and supervised educational setting for children while they are in Play Academy environment. Promote social, emotional, physical, and cognitive development of all children. Encourage parent involvement in all aspects of the program.  To develop individual goals for children, provide on-going assessment of progress and facilitate transition into the following classroom.
**DUTIES AND RESPONSIBILITIES**
- Assist in developing and utilize lesson plans, which reflect mandated elements, parental and cultural influences according to the State of Ohio standards and promote the social, emotional, physical, and cognitive development of the children.

- Assist in using Cinci after school curriculum and assessments for lesson planning. Children will choose what hey like and would like to work on through assessments.

- Responsible for proper attendance and meal count paperwork.

- Assist in completing 2 weekly informal observations for every child and keep work samples as evidence of observation.

- Create a way to communicate with parents on projects, homework, and other activities.

- Use the center's management system to post at least 2-3 times per week to parents in order to continue communication and a close relationship with families.

- Help in developing and implement monthly family involvement activities.

- Help with homework. Check with parents with what your role is.

- Work with appropriate agencies in developing specialized planning for children/families as needed. Coordinate with special needs consultants in the classroom and develop a collaborative approach that benefits all children in the classroom and meets needs as specified on the individual plans.

- Responsible for proper attendance and meal count paperwork.

- Complete annual professional development plan and teacher assistant assessment.

- Meet the needs of all children; including those who are at risk, those with special needs, those who are gifted, and those who are culturally diverse.

- Follow daily routine, which includes small and large group experiences, free choice time, music and movement, large and small motor activities, skill development, meals, and effective transitions between activities.

- Encourage experimentation, exploration, problem solving, cooperation, socialization, and choice-making; ask open-ended questions and listen respectfully to the answers.

- Assist in providing an atmosphere that promotes and reinforces parental involvement in the classroom:
  - report to the family about child’s day during the departure time (verbally or via a report in the center's management system)
  - always welcoming attitude towards any family members.

- Supervise and monitor children at all times. No talking or texting on the phone or engaging in long conversations or other activities that will distract you from adequate supervision.

- Understand that if children are left alone under your care, you will be written up and could lose your job.

- Monitor your classroom at all times. Be on the same level with children to observe and interact with them. When your children are in the gym or outside, you should be up and walking around the play area. You should never be sitting down during active play.

- Accommodate the eating and bodily care cycles of each child following communicable disease requirements and proper hand washing and Food Program guidelines.  Children should have a clean appearance. (Clean face, clean clothes and hands)

- Classroom should be kept clean and orderly.  All items should be put away each day.  Make sure that the room is clean each evening.  Use weak bleach to spray down toys, tables, chairs, bathroom as needed throughout the day.

- Respond to crisis or emergency situations that may occur. Provide first aid or CPR, prevent the spread of blood borne pathogens, and access emergency services as needed. Fill out paperwork for each incident that you have to perform first aid.  Make sure that parents are notified.

- Attend meetings, trainings, and appropriate professional development activities.

- Assure general maintenance and security of facility.

- Assist in inventory of all site equipment.

- Other duties as requested.

In order to verify my compliance with all of the duties and responsibilities, the Administrator will perform weekly checklists. Every line of that list must be checked "yes" as an absolute minimum of your position requirements. Unsatisfactory weekly checklists could result in the probation and release of duties.$body$,
  'active', current_date, now(), now()
)
on conflict (org_id, key, version) do nothing;

-- Retire the two generic teaching JDs (superseded by per-age-group docs).
update menumaker.policy_documents
   set status = 'retired'
 where org_id = '3a9a290e-7e49-491e-946b-ad86f2399910'
   and key in ('Staff_JD_Teacher','Staff_JD_TeacherAssistant')
   and version = 'v1'
   and status = 'active';
