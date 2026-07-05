import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Image, Video, Trash2, Link, Unlink, Play } from 'lucide-react';
import type { ArrowSession } from '@/types';
import { getMediaBlob } from '@/hooks/useMediaStorage';
import type { MediaMeta } from '@/hooks/useMediaStorage';
import { toast } from 'sonner';

interface SessionMediaGalleryProps {
  sessions: ArrowSession[];
  mediaStore: MediaMeta[];
  onAttachMedia: (sessionId: string, media: { id: string; type: 'video' | 'image'; label: string }) => void;
  onDetachMedia: (sessionId: string, mediaId: string) => void;
  onDeleteMedia: (id: string) => void;
}

export function SessionMediaGallery({ sessions, mediaStore, onAttachMedia, onDetachMedia, onDeleteMedia }: SessionMediaGalleryProps) {
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);

  const session = sessions.find(s => s.id === selectedSession);
  const sessionMedia = session?.media || [];

  // Unlinked media (not attached to any session)
  const linkedIds = new Set(sessions.flatMap(s => s.media?.map(m => m.id) || []));
  const unlinkedMedia = mediaStore.filter(m => !linkedIds.has(m.id));

  const handlePlayVideo = useCallback(async (mediaId: string) => {
    const blob = await getMediaBlob(mediaId);
    if (!blob) { toast.error('Video not found in storage'); return; }
    const url = URL.createObjectURL(blob);
    setPlayingVideo(url);
  }, []);

  return (
    <Card className="p-4 rounded-2xl space-y-3">
      <h3 className="text-sm font-medium flex items-center gap-1.5">
        <Image className="w-4 h-4 text-primary" /> Session Media
      </h3>

      {/* Session selector */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        <Button
          size="sm"
          variant={selectedSession === null ? 'default' : 'outline'}
          className="text-xs shrink-0 h-7"
          onClick={() => setSelectedSession(null)}
        >
          Unlinked ({unlinkedMedia.length})
        </Button>
        {sessions.slice(0, 20).map(s => (
          <Button
            key={s.id}
            size="sm"
            variant={selectedSession === s.id ? 'default' : 'outline'}
            className="text-xs shrink-0 h-7"
            onClick={() => setSelectedSession(s.id)}
          >
            {s.date} ({s.arrowCount})
          </Button>
        ))}
      </div>

      <Separator />

      {/* Media grid */}
      {selectedSession === null ? (
        // Unlinked media
        unlinkedMedia.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No unlinked media. Record a video or take a target photo first.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {unlinkedMedia.map(m => (
              <MediaThumb
                key={m.id}
                media={m}
                sessions={sessions}
                onAttach={(sid) => onAttachMedia(sid, { id: m.id, type: m.type, label: m.label })}
                onDelete={() => onDeleteMedia(m.id)}
                onPlay={m.type === 'video' ? () => handlePlayVideo(m.id) : undefined}
              />
            ))}
          </div>
        )
      ) : (
        // Session-linked media
        sessionMedia.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No media linked to this session.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {sessionMedia.map(m => {
              const meta = mediaStore.find(ms => ms.id === m.id);
              return (
                <div key={m.id} className="relative rounded-lg overflow-hidden border group">
                  {meta?.thumbnail ? (
                    <img src={meta.thumbnail} className="w-full aspect-square object-cover" alt={m.label} />
                  ) : (
                    <div className="w-full aspect-square bg-secondary flex items-center justify-center">
                      {m.type === 'video' ? <Video className="w-6 h-6 text-muted-foreground" /> : <Image className="w-6 h-6 text-muted-foreground" />}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <div className="flex gap-1">
                      {m.type === 'video' && meta && (
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-white" onClick={() => handlePlayVideo(m.id)}>
                          <Play className="w-4 h-4" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-white" onClick={() => onDetachMedia(selectedSession, m.id)}>
                        <Unlink className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-white" onClick={() => onDeleteMedia(m.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <Badge variant="secondary" className="absolute bottom-1 left-1 text-[8px] h-4 px-1">{m.label}</Badge>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Video player modal */}
      {playingVideo && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => { setPlayingVideo(null); URL.revokeObjectURL(playingVideo); }}>
          <video src={playingVideo} controls autoPlay className="max-w-full max-h-full rounded-lg" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </Card>
  );
}

function MediaThumb({ media, sessions, onAttach, onDelete, onPlay }: {
  media: MediaMeta;
  sessions: ArrowSession[];
  onAttach: (sessionId: string) => void;
  onDelete: () => void;
  onPlay?: () => void;
}) {
  const [showLink, setShowLink] = useState(false);

  return (
    <div className="relative rounded-lg overflow-hidden border group">
      {media.thumbnail ? (
        <img src={media.thumbnail} className="w-full aspect-square object-cover" alt={media.label} />
      ) : (
        <div className="w-full aspect-square bg-secondary flex items-center justify-center">
          {media.type === 'video' ? <Video className="w-6 h-6 text-muted-foreground" /> : <Image className="w-6 h-6 text-muted-foreground" />}
        </div>
      )}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
        <div className="flex gap-1">
          {onPlay && (
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-white" onClick={onPlay}>
              <Play className="w-4 h-4" />
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-white" onClick={() => setShowLink(!showLink)}>
            <Link className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-white" onClick={onDelete}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
      <Badge variant="secondary" className="absolute bottom-1 left-1 text-[8px] h-4 px-1">{media.label}</Badge>

      {/* Link to session dropdown */}
      {showLink && (
        <div className="absolute top-8 left-1 right-1 bg-popover border rounded-lg shadow-lg z-10 max-h-32 overflow-y-auto">
          <p className="text-[10px] text-muted-foreground px-2 pt-1">Link to session:</p>
          {sessions.slice(0, 10).map(s => (
            <button key={s.id} className="w-full text-left px-2 py-1 text-xs hover:bg-accent" onClick={() => { onAttach(s.id); setShowLink(false); }}>
              {s.date} - {s.arrowCount} arrows
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
