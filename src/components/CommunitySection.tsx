import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Users, BookOpen, Camera, Upload, X, Check, Heart, MessageCircle, AlertTriangle } from 'lucide-react';
import { db, collection, query, orderBy, onSnapshot, addDoc, doc, deleteDoc, auth } from '../lib/firebase';
import { CommunityPost, BlogPost, PostComment } from '../types';
import { format, parseISO } from 'date-fns';
import { nl } from 'date-fns/locale';
import { cn } from '../lib/utils';
import { apiUrl } from '../lib/api';
import { logAppError } from '../services/loggerService';
import { VotingWidget } from './VotingWidget';

// Helper to compress image and turn it into small JPEG base64 string
const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get 2D context'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        // Compress as JPEG with 0.6 quality to keep Base64 string under 50-85KB
        const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
        resolve(dataUrl);
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
};

const CommunityPostCard: React.FC<{ post: CommunityPost }> = ({ post }) => {
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
    const qComments = query(collection(db, `communityPosts/${post.id}/comments`), orderBy('timestamp', 'asc'));
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
      await addDoc(collection(db, `communityPosts/${post.id}/comments`), {
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
      await deleteDoc(doc(db, `communityPosts/${post.id}/comments`, commentId));
    } catch (err) {
      console.error('Failed to delete comment:', err);
    }
  };

  return (
    <>
      {/* Grid Thumbnail View */}
      <div className="break-inside-avoid bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-sm mb-6 group hover:shadow-md transition-shadow">
        <div 
          className="relative cursor-pointer overflow-hidden bg-slate-100" 
          onClick={() => setIsExpanded(true)}
        >
          <img 
            src={post.imageUrl} 
            alt={post.caption || 'Community foto'} 
            className="w-full h-auto object-cover transition-transform duration-700 group-hover:scale-105" 
          />
          <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/30 transition-colors flex items-center justify-center">
            <MessageCircle className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-md" />
          </div>
        </div>
        
        <div className="p-3 bg-white border-t border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img 
              src={post.userAvatar || `https://ui-avatars.com/api/?name=${post.userName || 'U'}`} 
              alt="" 
              className="w-6 h-6 rounded-full border border-slate-200" 
              referrerPolicy="no-referrer"
            />
            <span className="text-xs font-mono font-bold text-slate-800 uppercase truncate max-w-[120px]">{post.userName}</span>
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
              className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm cursor-pointer"
              onClick={() => setIsExpanded(false)}
            />
            
            {/* Modal Content */}
            <motion.div 
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="relative w-full max-w-5xl h-full max-h-[90vh] bg-white border border-slate-200 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row z-10"
            >
              {/* Left side: Image */}
              <div className="flex-1 bg-slate-950 flex items-center justify-center relative md:border-r border-slate-200 overflow-hidden min-h-[40vh] md:min-h-0">
                <img 
                  src={post.imageUrl} 
                  alt={post.caption || 'Community foto'} 
                  className="w-full h-full object-contain" 
                />
                {/* Mobile close button (absolute top right) */}
                <button 
                  onClick={() => setIsExpanded(false)}
                  className="md:hidden absolute top-4 right-4 p-2 bg-slate-900/70 hover:bg-slate-900 rounded-full text-white backdrop-blur-sm transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Right side: Info & Comments */}
              <div className="w-full md:w-[400px] lg:w-[450px] flex flex-col h-[50vh] md:h-full bg-slate-50">
                {/* Header: User Info & Actions */}
                <div className="p-4 border-b border-slate-200 flex items-center justify-between shrink-0 bg-white">
                  <div className="flex items-center gap-3">
                    <img 
                      src={post.userAvatar || `https://ui-avatars.com/api/?name=${post.userName || 'U'}`} 
                      alt="" 
                      className="w-8 h-8 rounded-full border border-slate-200" 
                      referrerPolicy="no-referrer"
                    />
                    <div className="text-xs font-mono leading-tight">
                      <div className="text-slate-900 font-bold">{post.userName}</div>
                      <div className="text-slate-500 text-[10px]">{format(parseISO(post.timestamp), 'd MMM yyyy, HH:mm', { locale: nl })}</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {canDelete && (
                      <button 
                        onClick={handleDeletePost}
                        className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 transition-colors rounded-full cursor-pointer"
                        title="Verwijder foto"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    <button 
                      onClick={() => setIsExpanded(false)}
                      className="hidden md:flex p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors rounded-full cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Scrollable middle section: Caption, Voting, Comments List */}
                <div className="flex-1 overflow-y-auto custom-scroll p-4 space-y-4">
                  {/* Caption & Voting */}
                  <div className="space-y-3 pb-4 border-b border-slate-200 bg-white p-3.5 rounded-xl border border-slate-200">
                    {post.caption && (
                      <p className="text-slate-900 text-sm leading-relaxed font-medium">{post.caption}</p>
                    )}
                    <div className="pt-1">
                      <VotingWidget 
                        itemId={post.id!} 
                        collectionName="communityPosts" 
                        upvotes={post.upvotes || []} 
                        downvotes={post.downvotes || []} 
                      />
                    </div>
                  </div>

                  {/* Comments List */}
                  <div className="space-y-2.5">
                    <h4 className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-500">Reacties ({comments.length})</h4>
                    {comments.length > 0 ? (
                      comments.map(c => (
                        <div key={c.id} className="group flex justify-between gap-3 text-xs bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                          <div className="flex flex-col gap-0.5 text-slate-700">
                            <span className="font-bold text-slate-900">{c.userName}</span>
                            <span className="break-words leading-relaxed text-slate-800">{c.text}</span>
                          </div>
                          {(isAdmin || currentUser?.uid === c.userId) && (
                            <button 
                              onClick={() => c.id && handleDeleteComment(c.id, c.userId)}
                              className="opacity-0 group-hover:opacity-100 text-rose-500 hover:text-rose-700 shrink-0 transition-opacity p-0.5 cursor-pointer self-start"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-6 text-slate-400 italic text-xs bg-white rounded-xl border border-slate-200">
                        Nog geen reacties. Wees de eerste!
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer: Add Comment */}
                <div className="p-4 border-t border-slate-200 bg-white shrink-0">
                  {currentUser ? (
                    <form onSubmit={handleAddComment} className="flex gap-2">
                      <input
                        type="text"
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="Voeg een reactie toe..."
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-cyan-600"
                        maxLength={1000}
                      />
                      <button 
                        type="submit" 
                        disabled={isSubmitting || !newComment.trim()}
                        className="text-xs font-bold text-white bg-slate-900 hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider px-4 py-2.5 rounded-xl transition-colors cursor-pointer"
                      >
                        Post
                      </button>
                    </form>
                  ) : (
                    <p className="text-xs text-slate-500 text-center font-medium">Log in via je profiel om te reageren.</p>
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

export function CommunitySection() {
  const [activeTab, setActiveTab] = useState<'gallery' | 'blog'>('gallery');
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [blogs, setBlogs] = useState<BlogPost[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showEula, setShowEula] = useState(false);
  const [eulaAccepted, setEulaAccepted] = useState(false);
  const [compressedImageData, setCompressedImageData] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [uploadError, setUploadError] = useState<{ message: string; details?: string; type: string } | null>(null);
  const [selectedFileMeta, setSelectedFileMeta] = useState<{ name: string; size: number; type: string } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Fetch gallery
    const qPosts = query(collection(db, 'communityPosts'), orderBy('timestamp', 'desc'));
    const unsubscribePosts = onSnapshot(qPosts, (snapshot) => {
      const postsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as CommunityPost[];
      setPosts(postsData.filter(post => post.imageUrl && !post.imageUrl.includes('firebasestorage.googleapis.com')));
    });

    // Fetch blogs
    const qBlogs = query(collection(db, 'blogPosts'), orderBy('timestamp', 'desc'));
    const unsubscribeBlogs = onSnapshot(qBlogs, (snapshot) => {
      let blogsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as BlogPost[];
      
      // If no blogs, add a dummy one
      if (blogsData.length === 0) {
        blogsData = [{
          id: 'demo-1',
          title: 'Welkom bij de Noordzeesurf Community',
          excerpt: 'Deel je sessies, vind nieuwe surfmaatjes en blijf op de hoogte van alles rondom de Noordzee.',
          content: 'Welkom bij het nieuwe blog gedeelte van Noordzeesurf. Hier plaatsen we regelmatig updates over de beste spots, interviews met lokale legendes en tips om je surfskills te verbeteren. \n\nWe nodigen iedereen uit om actief deel te nemen aan de community, foto\'s te uploaden en condities door te geven via de Spot Reports. See you out there!',
          authorName: 'Admin Team',
          timestamp: new Date().toISOString()
        }];
      }
      
      setBlogs(blogsData);
    });

    return () => {
      unsubscribePosts();
      unsubscribeBlogs();
    };
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setIsUploading(true);
      setUploadError(null);
      setSelectedFileMeta({
        name: file.name,
        size: file.size,
        type: file.type
      });

      try {
        const base64 = await compressImage(file);
        setCompressedImageData(base64);
        setShowEula(true);
      } catch (err: any) {
        console.error('Core Image Compression failed:', err);
        const errMsg = 'Afbeelding compressie mislukt.';
        const errDetails = err instanceof Error ? err.message : String(err);
        
        setUploadError({
          message: errMsg,
          details: errDetails,
          type: 'compression_failure'
        });
        
        await logAppError(
          'image_compression_failed',
          'Failed to compress selected community image file',
          { fileName: file.name, fileSize: file.size, fileType: file.type },
          err
        );
      } finally {
        setIsUploading(false);
      }
    }
  };

  const handleUpload = async () => {
    if (!compressedImageData || !eulaAccepted || !auth.currentUser) return;
    
    setIsUploading(true);
    setUploadError(null);

    // Pre-validate base64 size against 1MB (1,048,576 byte) rule limit
    if (compressedImageData.length > 1048576) {
      const sizeInKb = (compressedImageData.length / 1024).toFixed(1);
      const errMsg = 'De gecomprimeerde afbeelding is helaas te groot.';
      const errDetails = `De gecomprimeerde data is ${sizeInKb}KB groot. De database-limiet voor een enkele post is geconfigureerd op maximaal 1024KB (1MB) om server-overbelasting te voorkomen. Probeer aub een andere foto of crop hem eerst smaller.`;
      
      setUploadError({
        message: errMsg,
        details: errDetails,
        type: 'size_limit_exceeded'
      });

      await logAppError(
        'community_upload_size_limit',
        `Image upload rejected: compressed base64 size is ${sizeInKb}KB (maximum is 1024KB)`,
        {
          fileName: selectedFileMeta?.name,
          fileSizeOriginal: selectedFileMeta?.size,
          compressedLength: compressedImageData.length
        }
      );
      
      setIsUploading(false);
      return;
    }
    
    try {
      // Step 1: Content Moderation
      // De moderatie draait op de Express-backend. Bestaat die niet (bijv. in de
      // APK die vanaf https://localhost laadt), dan mag een netwerkfout de upload
      // niet blokkeren: we vangen 'm hier af en gaan gewoon door.
      let modRes: Response | null = null;
      try {
        modRes = await fetch(apiUrl("/api/moderate-image"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ base64Image: compressedImageData }),
        });
      } catch (modErr) {
        console.warn("Moderation API unreachable, continuing with upload anyway...", modErr);
      }

      if (modRes && modRes.ok) {
        const modData = await modRes.json();
        if (modData.isSafe === false) {
          setUploadError({
            message: "Foto is geweigerd door de automatische veiligheidscheck.",
            details: modData.reason || "De afbeelding bevat mogelijk ongepaste content of heeft niets met surfen te maken.",
            type: "moderation_rejected"
          });
          setIsUploading(false);
          return;
        }
      } else if (!modRes) {
        // netwerkfout hierboven al gelogd
      } else {
        console.warn("Moderation API call failed, continuing with upload anyway...");
      }

      // Step 2: Save to Firestore
      await addDoc(collection(db, 'communityPosts'), {
        userId: auth.currentUser.uid,
        userName: auth.currentUser.displayName || 'Anonieme Surfer',
        userEmail: auth.currentUser.email || '',
        userAvatar: auth.currentUser.photoURL || null,
        imageUrl: compressedImageData,
        caption: caption,
        timestamp: new Date().toISOString()
      });
      
      setCompressedImageData(null);
      setCaption('');
      setShowEula(false);
      setEulaAccepted(false);
      setUploadError(null);
      setSelectedFileMeta(null);
    } catch (error: any) {
      console.error('Error uploading post:', error);
      
      let errorMsg = 'Upload mislukt door een database-fout.';
      let details = error instanceof Error ? error.message : String(error);
      let errorType = 'community_upload_write_failed';

      if (error && typeof error === 'object' && 'code' in error) {
        const firebaseCode = (error as any).code;
        if (firebaseCode === 'permission-denied') {
          errorType = 'community_permission_denied';
          errorMsg = 'Upload geweigerd door database beveiligingsregels.';
          details = 'Mogelijke oorzaken:\n1. Je login-sessie is verlopen. Probeer opnieuw in te loggen via je profiel.\n2. De afbeelding is te groot voor de strict geconfigureerde server-beperkingen.\n3. Typfout in e-mail verificatie of restricties op accounts.';
        } else if (firebaseCode === 'unavailable') {
          errorType = 'community_network_offline';
          errorMsg = 'De database-server is tijdelijk onbereikbaar.';
          details = 'Controleer je internetverbinding en probeer het nog een keer.';
        } else {
          details = `Firebase Error Code: ${firebaseCode}\n${details}`;
        }
      }

      setUploadError({
        message: errorMsg,
        details,
        type: errorType
      });

      await logAppError(
        errorType,
        `Community photo upload failed: ${errorMsg}`,
        {
          fileName: selectedFileMeta?.name,
          fileSizeOriginal: selectedFileMeta?.size,
          compressedLength: compressedImageData.length
        },
        error
      );
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-32">
      <header className="text-center space-y-1">
        <h2 className="text-2xl sm:text-3xl font-black uppercase text-slate-900 tracking-tight font-tactical">Community</h2>
        <p className="text-xs font-mono text-cyan-700 tracking-widest uppercase font-bold">Vang de Noordzee Vibe</p>
      </header>
      
      {/* Tabs */}
      <div className="flex gap-1.5 p-1.5 bg-slate-100/90 backdrop-blur-md rounded-2xl border border-slate-200 mx-auto max-w-xs shadow-xs">
        <button 
          onClick={() => setActiveTab('gallery')}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold uppercase tracking-widest rounded-xl transition-all cursor-pointer font-mono",
            activeTab === 'gallery' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
          )}
        >
          <Camera className="w-4 h-4" />
          Gallery
        </button>
        <button 
          onClick={() => setActiveTab('blog')}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold uppercase tracking-widest rounded-xl transition-all cursor-pointer font-mono",
            activeTab === 'blog' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
          )}
        >
          <BookOpen className="w-4 h-4" />
          Blog
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'gallery' ? (
          <motion.div
            key="gallery"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-6"
          >
            {/* Upload Area */}
            {auth.currentUser ? (
              <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 text-center shadow-sm">
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-8 sm:py-10 border-2 border-dashed border-slate-200 hover:border-cyan-500 hover:bg-cyan-50/20 rounded-2xl flex flex-col items-center justify-center gap-3 transition-all group cursor-pointer"
                >
                  <div className="w-14 h-14 rounded-2xl bg-cyan-50 border border-cyan-200 flex items-center justify-center text-cyan-700 group-hover:scale-105 transition-transform">
                    <Upload className="w-7 h-7" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-black text-slate-900 uppercase font-tactical tracking-wide">Deel een foto</p>
                    <p className="text-xs text-slate-500 font-mono">Max 10MB (JPEG, PNG, WEBP)</p>
                  </div>
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-3xl p-6 border border-slate-200 text-center shadow-sm">
                <p className="text-slate-700 font-medium text-sm">Log in via je profiel om foto's te delen met de community.</p>
              </div>
            )}

            {/* Gallery Grid */}
            <div className="columns-1 sm:columns-2 lg:columns-3 gap-5 space-y-5">
              {posts.map(post => (
                <CommunityPostCard key={post.id} post={post} />
              ))}
            </div>
            
            {posts.length === 0 && (
              <div className="text-center py-12 bg-white rounded-3xl border border-slate-200 shadow-sm">
                <Camera className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-600 font-medium text-sm">Nog geen foto's gedeeld. Wees de eerste!</p>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="blog"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-6"
          >
            <div className="grid gap-6">
              {blogs.map(blog => (
                <article key={blog.id} className="bg-white rounded-3xl overflow-hidden border border-slate-200 shadow-sm hover:shadow-md transition-shadow group">
                  {blog.imageUrl && (
                    <div className="w-full h-56 sm:h-72 overflow-hidden relative bg-slate-100">
                      <img src={blog.imageUrl} alt={blog.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                    </div>
                  )}
                  <div className="p-6 sm:p-8 space-y-4">
                    <div className="space-y-1.5">
                      <div className="text-[10px] font-mono text-cyan-700 uppercase tracking-widest font-bold">
                        {format(parseISO(blog.timestamp), 'd MMMM yyyy', { locale: nl })}
                      </div>
                      <h3 className="text-xl sm:text-2xl font-black uppercase text-slate-900 leading-tight font-tactical">
                        {blog.title}
                      </h3>
                    </div>
                    
                    <div className="text-slate-600 leading-relaxed text-sm sm:text-base space-y-3">
                      {blog.content.split('\n').map((paragraph, i) => (
                        <p key={i}>{paragraph}</p>
                      ))}
                    </div>
                    
                    <div className="flex items-center justify-between pt-5 border-t border-slate-100">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-cyan-50 border border-cyan-200 flex items-center justify-center text-cyan-700">
                          <Users className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono">{blog.authorName}</span>
                      </div>
                      {blog.id !== 'demo-1' && (
                        <VotingWidget 
                          itemId={blog.id!} 
                          collectionName="blogPosts" 
                          upvotes={blog.upvotes || []} 
                          downvotes={blog.downvotes || []} 
                        />
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* EULA Modal */}
      <AnimatePresence>
        {showEula && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm modal-backdrop"
              onClick={() => { setShowEula(false); setCompressedImageData(null); setUploadError(null); setSelectedFileMeta(null); }}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-lg bg-white border border-slate-200 modal-dialog rounded-3xl p-6 sm:p-8 space-y-5 shadow-2xl overflow-hidden z-10"
            >
              <div className="modal-header pb-3 border-b border-slate-100 flex items-center justify-between">
                <h3 className="modal-title text-xl font-black uppercase text-slate-900 font-tactical">Upload Voorwaarden</h3>
                <button
                  onClick={() => { setShowEula(false); setCompressedImageData(null); setUploadError(null); setSelectedFileMeta(null); }}
                  className="modal-close-btn p-2 bg-slate-100 rounded-full hover:bg-slate-200 text-slate-600 transition-colors flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <div className="modal-subcard space-y-3 p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 h-44 overflow-y-auto custom-scroll">
                <p className="font-semibold text-slate-800">Door deze foto te uploaden ga je akkoord met de volgende voorwaarden:</p>
                <ol className="list-decimal pl-4 space-y-2">
                  <li>Je beschikt over de rechten om deze foto te delen.</li>
                  <li>De foto bevat geen ongepaste, schokkende of illegale content.</li>
                  <li>Noordzeesurf is <strong>niet aansprakelijk</strong> voor eventuele schade, inbreuk op privacy of misbruik van de foto door derden na uploaden.</li>
                  <li>Noordzeesurf behoudt zich het recht voor om foto's op elk moment zonder opgaaf van reden te verwijderen.</li>
                </ol>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-slate-500 uppercase tracking-widest font-bold">Bijschrift (Optioneel)</label>
                <textarea 
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-900 text-sm focus:border-cyan-600 focus:outline-none placeholder-slate-400"
                  rows={2}
                  placeholder="Wat gebeurt er op de foto?"
                />
              </div>

              <label className="flex items-start gap-3 cursor-pointer group select-none">
                <div className="mt-0.5 relative flex items-center justify-center">
                  <input type="checkbox" checked={eulaAccepted} onChange={(e) => setEulaAccepted(e.target.checked)} className="peer sr-only" />
                  <div className="w-5 h-5 rounded-md border-2 border-slate-300 peer-checked:bg-cyan-600 peer-checked:border-cyan-600 transition-all flex items-center justify-center" />
                  <Check className="w-3.5 h-3.5 text-white absolute opacity-0 peer-checked:opacity-100 transition-opacity" />
                </div>
                <span className="text-xs text-slate-700 group-hover:text-slate-900 transition-colors font-medium">
                  Ik ga akkoord dat Noordzeesurf niet aansprakelijk is voor deze upload.
                </span>
              </label>

              {uploadError && (
                <div id="upload-error-detail-panel" className="p-3.5 rounded-xl border border-rose-200 bg-rose-50 text-xs text-rose-800 space-y-1.5">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-bold">{uploadError.message}</p>
                      {uploadError.details && (
                        <details className="text-rose-700 font-mono text-[10px] cursor-pointer">
                          <summary className="hover:text-rose-900 select-none font-bold">Meer details</summary>
                          <pre className="mt-1 p-2 bg-white rounded border border-rose-200 overflow-x-auto whitespace-pre-wrap select-all max-h-32 overflow-y-auto font-mono text-rose-900">
                            {uploadError.details}
                          </pre>
                        </details>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => { setShowEula(false); setCompressedImageData(null); setUploadError(null); setSelectedFileMeta(null); }}
                  className="modal-btn-secondary flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 border border-slate-200 transition-colors cursor-pointer text-xs uppercase font-mono"
                >
                  Annuleren
                </button>
                <button 
                  onClick={handleUpload}
                  disabled={!eulaAccepted || isUploading}
                  className="modal-btn-primary flex-1 py-3 bg-slate-900 hover:bg-cyan-700 text-white font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 cursor-pointer text-xs uppercase font-mono"
                >
                  {isUploading ? 'Uploaden...' : 'Upload Foto'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
