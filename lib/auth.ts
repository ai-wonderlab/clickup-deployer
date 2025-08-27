import NextAuth from "next-auth"
import Google from "next-auth/providers/google"

// Allowed email domains
const ALLOWED_DOMAINS = [
  'wdmf.eu',
  'viralpassion.gr', 
  'aiwonderlab.eu'
];

function isAllowedEmail(email: string): boolean {
  return ALLOWED_DOMAINS.some(domain => email.toLowerCase().endsWith(`@${domain}`));
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    })
  ],
  pages: {
    signIn: '/login',
    error: '/login', // Redirect unauthorized users to login with error
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      // Check if user's email is from allowed domain
      if (user.email && isAllowedEmail(user.email)) {
        return true;
      }
      
      // Reject sign-in for non-allowed domains
      console.log(`Access denied for email: ${user.email}`);
      return false;
    },
    
    async session({ session, token }) {
      // Double-check session user email is still allowed
      if (session.user?.email && !isAllowedEmail(session.user.email)) {
        // Force sign out by throwing an error instead of returning null
        throw new Error('Access denied: Email domain not allowed');
      }
      return session;
    },
    
    authorized: async ({ auth, request: { nextUrl } }) => {
      const isLoggedIn = !!auth?.user
      const isOnProtectedRoute = nextUrl.pathname.startsWith('/app') || nextUrl.pathname === '/'
      
      if (isOnProtectedRoute) {
        if (isLoggedIn && auth.user?.email && isAllowedEmail(auth.user.email)) {
          return true;
        }
        return false; // Redirect unauthenticated or unauthorized users
      }
      
      return true;
    },
  },
})
