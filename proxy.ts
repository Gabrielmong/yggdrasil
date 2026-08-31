export { auth as proxy } from "@/lib/auth";

export const config = {
  matcher: ["/add/:path*", "/bookshelf/:path*", "/books/:path*", "/friends/:path*"],
};
