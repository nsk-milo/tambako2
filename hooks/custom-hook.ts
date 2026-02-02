import { useState, useEffect } from "react";
import { UserPayload } from "@/lib/auth";

// Define a generic interface for the hook's return value
interface UsePageDataResult<T> {
  user: UserPayload | null;
  data: T[];
  loading: boolean;
  error: Error | null;
}

/**
 * A custom hook to fetch user data and media content for a page.
 * @param mediaApiEndpoint - The API endpoint to fetch the media content from.
 * @param mediaKey - The key in the JSON response that contains the media array. If undefined, the response is assumed to be the array.
 * @returns An object containing the user, media data, loading state, and error state.
 */
export function usePageData<T = any>(
  mediaApiEndpoint: string,
  mediaKey?: string
): UsePageDataResult<T> {
  const [user, setUser] = useState<UserPayload | null>(null);
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [userResponse, mediaResponse] = await Promise.all([
          fetch("/api/auth/me"),
          fetch(mediaApiEndpoint),
        ]);

        if (userResponse.ok) setUser((await userResponse.json()).user);

        if (mediaResponse.ok) {
          const mediaData = await mediaResponse.json();
          setData(mediaKey ? mediaData[mediaKey] : mediaData);
        } else {
          throw new Error(`Failed to fetch from ${mediaApiEndpoint}`);
        }
      } catch (err: any) {
        setError(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [mediaApiEndpoint, mediaKey]);

  return { user, data, loading, error };
}

