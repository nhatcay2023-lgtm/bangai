# Security Specification — Bảng Phấn AI

## 1. Data Invariants
1. Every chalkboard document at `/users/{userId}/boards/{boardId}` belongs strictly to the authenticated user (`userId == request.auth.uid` and `ownerId == request.auth.uid`) with verified email (`request.auth.token.email_verified == true`).
2. `boardId` and `ownerId` are immutable after creation and must match the document path variables `{boardId}` and `{userId}`.
3. `createdAt` is server-stamped on creation (`request.time`) and immutable on updates; `updatedAt` must always equal `request.time`.
4. `strokes` is strictly bounded to `<= 800` map elements and `items` is strictly bounded to `<= 100` map elements to prevent unbounded storage / denial-of-wallet attacks.
5. `theme` and `gridType` are restricted to explicit allowlists (`['green', 'black', 'navy', 'paper']` and `['none', 'square', 'lined', 'axes']`).

## 2. Dirty Dozen Adversarial Payloads
1. **Identity Spoofing on Create**: `ownerId` set to another user's UID (`"other-uid-999"`) under `/users/my-uid/boards/b1` -> MUST FAIL (`PERMISSION_DENIED`).
2. **Cross-User Read/List**: Authenticated User B reads or lists `/users/user-a/boards` -> MUST FAIL (`PERMISSION_DENIED`).
3. **Unverified Email Write**: Authenticated user with `email_verified: false` creates a board -> MUST FAIL (`PERMISSION_DENIED`).
4. **Shadow Field Injection**: Create or update payload includes extra field `isAdmin: true` -> MUST FAIL (`hasOnly` rejection).
5. **Path ID Poisoning**: Document ID `boardId` contains invalid characters (`"../admin"` or >128 chars) -> MUST FAIL (`isValidId` rejection).
6. **Immutable Field Mutation**: Update attempts to change `ownerId` or `createdAt` -> MUST FAIL (`PERMISSION_DENIED`).
7. **Forged Client Timestamp**: Create or update sends a past/future `createdAt` or `updatedAt` instead of `request.time` -> MUST FAIL (`PERMISSION_DENIED`).
8. **Invalid Theme Enum**: Update sets `theme: "neon-purple"` -> MUST FAIL (`PERMISSION_DENIED`).
9. **Oversized Title String**: Create sets `title` to a 500-character string -> MUST FAIL (`title.size() <= 120`).
10. **Array Element Type Poisoning**: Create sends `strokes: ["not-a-map"]` -> MUST FAIL (`strokes[0] is map`).
11. **Unbounded Array Exhaustion**: Update sends `items` with 101 elements -> MUST FAIL (`items.size() <= 100`).
12. **Unauthenticated Access**: Unauthenticated client attempts `get`, `list`, `create`, `update`, or `delete` on any path -> MUST FAIL (`PERMISSION_DENIED`).
