import { isApiPath, isPublicApiPath } from "../server/services/apiAccessPolicy";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

assert(isApiPath("/api/projects"), "lowercase API route must be protected");
assert(isApiPath("/API/projects"), "uppercase API route must be protected");
assert(isApiPath("/Api/projects/123"), "mixed-case API route must be protected");
assert(!isPublicApiPath("/API/projects"), "protected route must not become public");

assert(isPublicApiPath("/api/auth/login"), "login route must remain public");
assert(isPublicApiPath("/API/AUTH/LOGIN"), "mixed-case login route must remain public");
assert(isPublicApiPath("/Api/Health/"), "case and trailing slash must match Express routing");

assert(!isApiPath("/apiary"), "non-API prefix must not be classified as an API route");
assert(!isPublicApiPath("/api/auth/login/extra"), "public route descendants must remain protected");

console.log("API access policy tests passed");
