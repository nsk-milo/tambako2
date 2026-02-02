import { cookies } from "next/headers"
import { verify } from "jsonwebtoken"

// This interface should match the payload you create during login
export interface UserPayload {
  userId: string
  phoneNumber: string
  username: string
  role?: string | null
  iat: number
  exp: number
}

export const getUserDataFromToken = async (): Promise<UserPayload | null> => {
  try {
    const cookieStore = cookies()
    const token = (await cookieStore).get("authToken")?.value

    if (!token) {
      // No token found, user is not logged in
      return null
    }

    const jwtSecret = process.env.JWT_SECRET
    if (!jwtSecret) {
      // This should be a server-side error, as the secret must be configured
      console.error("JWT_SECRET is not defined in environment variables.")
      throw new Error("Server configuration error.")
    }

    // The 'verify' function will throw an error if the token is invalid or expired
    const decodedToken = verify(token, jwtSecret) as UserPayload
    console.log("Decoded JWT Token:", decodedToken) // For debugging purposes

    return decodedToken
  } catch (error) {
    console.error("Error verifying token:", error)
    // This will catch errors from verify (e.g., invalid signature, expired token).
    // Returning null is the expected behavior for an unauthenticated/invalid user.
    return null
  }
}
