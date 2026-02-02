'use client';

import { useState, useEffect, useCallback } from 'react';
import { Heart } from 'lucide-react';
// Note: This example uses the toast from shadcn/ui.
// You can replace this with your own notification system.
import { useToast } from '@/components/ui/use-toast';

interface FavoriteButtonProps {
  mediaId: string;
}

const FavoriteButton: React.FC<FavoriteButtonProps> = ({ mediaId }) => {
  const [isFavorite, setIsFavorite] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  // Fetch initial favorite status using GET /api/favorites/[mediaId]
  const checkFavoriteStatus = useCallback(async () => {
    if (!mediaId) return;
    setIsLoading(true);
    try {
      const response = await fetch(`/api/favourites/${mediaId}`);
      // A 401 from the API is handled by getUserDataFromToken, which results
      // in a { isFavorite: false } response, so we don't need special error handling here.
      const data = await response.json();
      setIsFavorite(data.isFavorite);
    } catch (error) {
      console.error('Error checking favorite status:', error);
      setIsFavorite(false); // Assume not favorite on network error
    } finally {
      setIsLoading(false);
    }
  }, [mediaId]);

  useEffect(() => {
    checkFavoriteStatus();
  }, [checkFavoriteStatus]);

  // Toggle favorite status using POST /api/favorites
  const handleToggleFavorite = async () => {
    if (isFavorite === null) return; // Don't do anything if initial state is not loaded

    setIsLoading(true);
    const originalIsFavorite = isFavorite;
    
    // Optimistic update for instant UI feedback
    setIsFavorite(!originalIsFavorite);

    try {
      const response = await fetch('/api/favourites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaId }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Revert on error and show a toast
        setIsFavorite(originalIsFavorite);
        toast({
          title: 'Error',
          description: data.error || 'Could not update favorites.',
          variant: 'destructive',
        });
      } else {
        // The API was successful, confirm the state and show a success toast
        setIsFavorite(data.isFavorite);
        toast({ title: 'Success', description: data.message });
      }
    } catch (error) {
        console.error('Network error toggling favorite:', error);  
      // Revert on network error
      setIsFavorite(originalIsFavorite);
      toast({ title: 'Error', description: 'A network error occurred.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleToggleFavorite}
      disabled={isLoading || isFavorite === null}
      className="p-2 rounded-full bg-gray-800 bg-opacity-50 hover:bg-opacity-75 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
    >
      <Heart className={`w-6 h-6 transition-all ${isFavorite ? 'text-red-500 fill-current' : 'text-white'}`} />
    </button>
  );
};

export default FavoriteButton;