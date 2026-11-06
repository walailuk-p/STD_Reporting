# Security Specification: Student Score Announcement System

## 1. System Invariants
1. Students can only access their own specific document `student_records/{studentId}` by exact ID matching.
2. List operations (`allow list`) on `student_records` are strictly forbidden (`allow list: if false;`) to prevent bulk scraping or discovering other students' identities or scores.
3. Plain-text passwords are never accepted or stored. PINs must be cryptographically hashed (PBKDF2/SHA-256) with a salt before persistence.
4. Courses and student rosters can only be created, modified, or deleted by verified instructors (`request.auth != null && request.auth.token.email_verified == true`).
5. Only the instructor who created a course (`resource.data.instructorUid == request.auth.uid`) or an administrator with `@bu.ac.th` domain can edit or publish scores for that course.
6. Score update operations must preserve structural integrity (keys must strictly match allowed score fields: `ATTEN`, `CA`, `AS`, `MID`, `TOTAL`).
7. Single-document quota optimization: A student checking their score triggers at most 1 document read from `student_records/{studentId}`, satisfying the Spark free-tier constraint.

## 2. The Dirty Dozen Payloads (Negative Test Payloads)
1. **Bulk Scrape Attack**: Malicious client attempts `collection(db, 'student_records')` without specifying an ID. Expected: `PERMISSION_DENIED`.
2. **ID Hijacking**: User attempts to update `student_records/1650700001` with arbitrary data or another student's ID. Expected: `PERMISSION_DENIED`.
3. **Plain Text Injection**: Malicious client attempts to write `plainTextPin: "123456"` to `student_records`. Expected: `PERMISSION_DENIED`.
4. **Unauthorized Course Creation**: Unauthenticated request to create a course document in `/courses`. Expected: `PERMISSION_DENIED`.
5. **Course Impersonation**: Authenticated user attempts to create a course with `instructorUid` set to another user's UID. Expected: `PERMISSION_DENIED`.
6. **Cross-Instructor Tampering**: Instructor B attempts to update course settings or scores belonging to Instructor A. Expected: `PERMISSION_DENIED`.
7. **Score Structure Pollution**: Updating student scores with arbitrary unauthorized keys (e.g., `bonus: 999`, `grade: "A+"`). Expected: `PERMISSION_DENIED`.
8. **Unverified Email Modification**: Write attempt from an account where `email_verified == false`. Expected: `PERMISSION_DENIED`.
9. **Doc ID Path Variable Overflow**: Attempting to write with an invalid ID containing 1KB characters or control characters. Expected: `PERMISSION_DENIED`.
10. **Immutable Field Mutate**: Attempting to change `createdAt` or `instructorUid` on existing course. Expected: `PERMISSION_DENIED`.
11. **Roster Leak via Subcollection List**: Unauthenticated attempt to query `/courses/{courseId}/students`. Expected: `PERMISSION_DENIED`.
12. **Malicious Lockout Reset**: Unauthenticated attempt to reset `failedAttempts` or delete another student's record. Expected: `PERMISSION_DENIED`.
