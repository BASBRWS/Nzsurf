import React, { useState } from 'react';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { auth, db, doc, updateDoc, deleteDoc, arrayUnion, arrayRemove } from '../lib/firebase';
import { cn } from '../lib/utils';

interface VotingProps {
  itemId: string;
  collectionName: 'communityPosts' | 'blogPosts';
  upvotes: string[];
  downvotes: string[];
}

export const VotingWidget = ({ itemId, collectionName, upvotes = [], downvotes = [] }: VotingProps) => {
  const currentUser = auth.currentUser;
  const [isVoting, setIsVoting] = useState(false);

  const hasUpvoted = currentUser ? upvotes.includes(currentUser.uid) : false;
  const hasDownvoted = currentUser ? downvotes.includes(currentUser.uid) : false;

  const handleVote = async (type: 'up' | 'down') => {
    if (!currentUser || !itemId || isVoting) return;
    setIsVoting(true);

    try {
      const docRef = doc(db, collectionName, itemId);
      const uid = currentUser.uid;

      let newUpvotes = [...upvotes];
      let newDownvotes = [...downvotes];

      if (type === 'up') {
        if (hasUpvoted) {
          await updateDoc(docRef, { upvotes: arrayRemove(uid) });
          newUpvotes = newUpvotes.filter(id => id !== uid);
        } else {
          await updateDoc(docRef, {
            upvotes: arrayUnion(uid),
            downvotes: arrayRemove(uid)
          });
          newUpvotes.push(uid);
          newDownvotes = newDownvotes.filter(id => id !== uid);
        }
      } else {
        if (hasDownvoted) {
          await updateDoc(docRef, { downvotes: arrayRemove(uid) });
          newDownvotes = newDownvotes.filter(id => id !== uid);
        } else {
          await updateDoc(docRef, {
            downvotes: arrayUnion(uid),
            upvotes: arrayRemove(uid)
          });
          newDownvotes.push(uid);
          newUpvotes = newUpvotes.filter(id => id !== uid);
        }
      }

      // Check auto-delete (60% downvotes, min 5 votes total)
      const totalVotes = newUpvotes.length + newDownvotes.length;
      if (totalVotes >= 5 && (newDownvotes.length / totalVotes) >= 0.6) {
        try {
          await deleteDoc(docRef);
          console.log(`Auto-deleted ${collectionName}/${itemId} due to low reputation.`);
        } catch (delErr) {
          console.error("Failed to auto-delete post:", delErr);
        }
      }
    } catch (err) {
      console.error("Voting failed:", err);
    } finally {
      setIsVoting(false);
    }
  };

  return (
    <div className="flex items-center gap-1 bg-black/20 rounded-full px-2 py-1">
      <button 
        onClick={() => handleVote('up')}
        disabled={isVoting || !currentUser}
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-bold transition-colors disabled:opacity-50",
          hasUpvoted ? "text-emerald-400 bg-emerald-400/10" : "text-white/50 hover:text-emerald-400 hover:bg-emerald-400/5"
        )}
      >
        <ThumbsUp className="w-3.5 h-3.5" />
        {upvotes.length}
      </button>
      <div className="w-px h-3 bg-white/10" />
      <button 
        onClick={() => handleVote('down')}
        disabled={isVoting || !currentUser}
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-bold transition-colors disabled:opacity-50",
          hasDownvoted ? "text-red-400 bg-red-400/10" : "text-white/50 hover:text-red-400 hover:bg-red-400/5"
        )}
      >
        <ThumbsDown className="w-3.5 h-3.5" />
        {downvotes.length}
      </button>
    </div>
  );
};
