export const PUBLIC_HEADER_FILE: string;
export const LOGIN_FREE_FILES: ReadonlyArray<readonly [string, string]>;
export function assertHeaderAuthControl(source: string): void;
export function assertNoDuplicateLogin(name: string, source: string): void;
export function assertPublicHeaderAuth(read: (file: string) => string): void;
