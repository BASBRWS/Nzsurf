const fs = require('fs');

let content = fs.readFileSync('src/components/CommunitySection.tsx', 'utf-8');

const startStr = "const CommunityPostCard = ({ post }: { post: CommunityPost }) => {";
const endStr = "export function CommunitySection() {";

const startIndex = content.indexOf(startStr);
const endIndex = content.indexOf(endStr);

if (startIndex !== -1 && endIndex !== -1) {
  const newCard = `const CommunityPostCard = ({ post }: { post: CommunityPost }) => {
  const [comments, setComments] = useState<PostComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  
  const currentUser = auth.currentUser;
  
  const isAdmin = currentUser?.email === 'sebastiaan.boom@gmail.com' || currentUser?.email === 'sebastiaan.boom2@gmail.com';
  const isOwner = currentUser?.uid === post.userId;
  const canDelete = isAdmin || isOwner;

  useEffect(() => {
    if (!post.id || !isExpanded) return;
    const qComments = query(collection(db, \`communityPosts/\${post.id}/comments\`), orderBy('timestamp', 'asc'));
    const unsubscribe = onSnapshot(qComments, (snapshot) => {
      const commentsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as PostComment[];
      setComments(commentsData);
    });
    return () => unsubscribe();
  }, [post.id, isExpanded]);

  const handleDeletePost = async () => {
    if (!post.id || !canDelete) return;
    if (window.confirm('Weet je zeker dat je deze foto wilt verwijderen?')) {
      try {
        await deleteDoc(doc(db, 'communityPosts', post.id));
      } catch (err) {
        console.error('Failed to delete post:', err);
      }
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !currentUser || !post.id) return;
    
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, \`communityPosts/\${post.id}/comments\`), {
        userId: currentUser.uid,
        userName: currentUser.displayName || 'Anonieme Surfer',
        text: newComment.trim(),
        timestamp: new Date().toISOString()
      });
      setNewComment('');
    } catch (err) {
      console.error('Failed to add comment:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: string, commentUserId: string) => {
    if (!post.id || (!isAdmin && currentUser?.uid !== commentUserId)) return;
    try {
      await deleteDoc(doc(db, \`communityPosts/\${post.id}/comments\`, commentId));
    } catch (err) {
      console.error('Failed to delete comment:', err);
    }
  };

  return (
    <>
      {/* Grid Thumbnail View */}
      <div className="break-inside-avoid glass rounded-2xl overflow-hidden border border-white/5 mb-6 group">
        <div 
          className="relative cursor-pointer overflow-hidden" 
          onClick={() => setIsExpanded(true)}
        >
          <img 
            src={post.imageUrl} 
            alt={post.caption || 'Community foto'} 
            className="w-full h-auto object-cover transition-transform duration-700 group-hover:scale-105" 
          />
          <div className="absolute inset-0 bg-marine-950/0 group-hover:bg-marine-950/20 transition-colors flex items-center justify-center">
            <MessageCircle className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-md" />
          </div>
        </div>
        
        <div className="p-3 bg-marine-950/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img 
              src={post.userAvatar || \`https://ui-avatars.com/api/?name=\${post.userName || 'U'}\`} 
              alt="" 
              className="w-6 h-6 rounded-full border border-white/10" 
              referrerPolicy="no-referrer"
            />
            <span className="text-[10px] font-mono text-white/60 uppercase truncate max-w-[100px]">{post.userName}</span>
          </div>
          <VotingWidget 
            itemId={post.id!} 
            collectionName="communityPosts" 
            upvotes={post.upvotes || []} 
            downvotes={post.downvotes || []} 
          />
        </div>
      </div>

      {/* Expanded Modal View */}
      <AnimatePresence>
        {isExpanded && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-6 md:p-12">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-marine-950/95 backdrop-blur-md cursor-pointer"
              onClick={() => setIsExpanded(false)}
            />
            
            {/* Modal Content */}
            <motion.div 
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="relative w-full max-w-5xl h-full max-h-[90vh] glass bg-marine-900 border border-white/10 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row z-10"
            >
              {/* Left side: Image */}
              <div className="flex-1 bg-black/50 flex items-center justify-center relative md:border-r border-white/5 overflow-hidden min-h-[40vh] md:min-h-0">
                <img 
                  src={post.imageUrl} 
                  alt={post.caption || 'Community foto'} 
                  className="w-full h-full object-contain" 
                />
                {/* Mobile close button (absolute top right) */}
                <button 
                  onClick={() => setIsExpanded(false)}
                  className="md:hidden absolute top-4 right-4 p-2 bg-black/50 hover:bg-black/80 rounded-full text-white backdrop-blur-sm transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Right side: Info & Comments */}
              <div className="w-full md:w-[400px] lg:w-[450px] flex flex-col h-[50vh] md:h-full bg-marine-950/50">
                {/* Header: User Info & Actions */}
                <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-3">
                    <img 
                      src={post.userAvatar || \`https://ui-avatars.com/api/?name=\${post.userName || 'U'}\`} 
                      alt="" 
                      className="w-8 h-8 rounded-full" 
                      referrerPolicy="no-referrer"
                    />
                    <div className="text-[10px] font-mono uppercase leading-tight">
                      <div className="text-white/90 font-bold">{post.userName}</div>
                      <div className="text-white/40">{format(parseISO(post.timestamp), 'd MMM yyyy, HH:mm', { locale: nl })}</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {canDelete && (
                      <button 
                        onClick={handleDeletePost}
                        className="p-1.5 text-red-400/60 hover:text-red-400 transition-colors bg-white/5 rounded-full"
                        title="Verwijder foto"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    <button 
                      onClick={() => setIsExpanded(false)}
                      className="hidden md:flex p-1.5 text-white/60 hover:text-white transition-colors bg-white/5 rounded-full"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Scrollable middle section: Caption, Voting, Comments List */}
                <div className="flex-1 overflow-y-auto custom-scroll p-4 space-y-6">
                  {/* Caption & Voting */}
                  <div className="space-y-4 pb-4 border-b border-white/5">
                    {post.caption && (
                      <p className="text-white/80 text-sm leading-relaxed">{post.caption}</p>
                    )}
                    <VotingWidget 
                      itemId={post.id!} 
                      collectionName="communityPosts" 
                      upvotes={post.upvotes || []} 
                      downvotes={post.downvotes || []} 
                    />
                  </div>

                  {/* Comments List */}
                  <div className="space-y-4">
                    {comments.length > 0 ? (
                      comments.map(c => (
                        <div key={c.id} className="group flex justify-between gap-3 text-sm">
                          <div className="flex gap-2 text-white/70">
                            <span className="font-bold text-white/90 shrink-0">{c.userName}</span>
                            <span className="break-words leading-relaxed">{c.text}</span>
                          </div>
                          {(isAdmin || currentUser?.uid === c.userId) && (
                            <button 
                              onClick={() => c.id && handleDeleteComment(c.id, c.userId)}
                              className="opacity-0 group-hover:opacity-100 text-red-400/60 hover:text-red-400 shrink-0 transition-opacity p-0.5"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-white/30 italic text-sm">
                        Nog geen reacties. Wees de eerste!
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer: Add Comment */}
                <div className="p-4 border-t border-white/10 bg-marine-950/80 shrink-0">
                  {currentUser ? (
                    <form onSubmit={handleAddComment} className="flex gap-2">
                      <input
                        type="text"
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="Voeg een reactie toe..."
                        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50"
                        maxLength={1000}
                      />
                      <button 
                        type="submit" 
                        disabled={isSubmitting || !newComment.trim()}
                        className="text-xs font-bold text-accent disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider px-4 bg-accent/10 hover:bg-accent/20 rounded-xl transition-colors"
                      >
                        Post
                      </button>
                    </form>
                  ) : (
                    <p className="text-xs text-white/40 text-center">Log in om te reageren.</p>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

`;
  
  content = content.substring(0, startIndex) + newCard + content.substring(endIndex);
  fs.writeFileSync('src/components/CommunitySection.tsx', content);
  console.log('Replaced successfully');
} else {
  console.error('Could not find start or end strings');
}
