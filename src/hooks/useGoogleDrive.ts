import { useState, useCallback, useRef } from 'react';

const SCOPES = 'https://www.googleapis.com/auth/drive.file';

interface DriveFile {
  id: string;
  name: string;
  modifiedTime: string;
}

interface TokenResponse {
  access_token: string;
  error?: string;
}

interface TokenClient {
  requestAccessToken: () => void;
}

export function useGoogleDrive() {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const tokenClientRef = useRef<TokenClient | null>(null);
  const accessTokenRef = useRef<string | null>(null);

  const initClient = useCallback((clientId: string) => {
    return new Promise<void>((resolve, reject) => {
      if (!clientId) {
        reject(new Error('Google Client ID is required'));
        return;
      }

      if (tokenClientRef.current) {
        resolve();
        return;
      }

      const existingScript = document.getElementById('gis-script');
      if (!existingScript) {
        const script = document.createElement('script');
        script.id = 'gis-script';
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = () => {
          try {
            tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
              client_id: clientId,
              scope: SCOPES,
              callback: (tokenResponse: TokenResponse) => {
                if (tokenResponse.error) {
                  setLastError(tokenResponse.error);
                  setIsSignedIn(false);
                  return;
                }
                accessTokenRef.current = tokenResponse.access_token;
                setIsSignedIn(true);
                setLastError(null);
              },
            });
            resolve();
          } catch (e) {
            reject(e);
          }
        };
        script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
        document.body.appendChild(script);
      } else {
        try {
          tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: SCOPES,
            callback: (tokenResponse: TokenResponse) => {
              if (tokenResponse.error) {
                setLastError(tokenResponse.error);
                setIsSignedIn(false);
                return;
              }
              accessTokenRef.current = tokenResponse.access_token;
              setIsSignedIn(true);
              setLastError(null);
            },
          });
          resolve();
        } catch (e) {
          reject(e);
        }
      }
    });
  }, []);

  const signIn = useCallback(async () => {
    if (!tokenClientRef.current) {
      setLastError('Google Drive not initialized');
      return;
    }
    tokenClientRef.current.requestAccessToken();
  }, []);

  const signOut = useCallback(() => {
    const token = accessTokenRef.current;
    if (token && window.google) {
      window.google.accounts.oauth2.revoke(token, () => {
        accessTokenRef.current = null;
        setIsSignedIn(false);
      });
    } else {
      accessTokenRef.current = null;
      setIsSignedIn(false);
    }
  }, []);

  const uploadFile = useCallback(async (content: string, filename = 'arrow-tracker-backup.json') => {
    const token = accessTokenRef.current;
    if (!token) throw new Error('Not signed in');

    setIsLoading(true);
    try {
      const searchRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
          `name='${filename}' and trashed=false`
        )}&fields=files(id,name)`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const searchData = await searchRes.json();
      const existingFile = searchData.files?.[0];

      const metadata = { name: filename, mimeType: 'application/json' };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', new Blob([content], { type: 'application/json' }));

      let url: string;
      let method: string;
      if (existingFile) {
        url = `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=multipart`;
        method = 'PATCH';
      } else {
        url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
        method = 'POST';
      }

      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      return await res.json();
    } finally {
      setIsLoading(false);
    }
  }, []);

  const downloadFile = useCallback(async (filename = 'arrow-tracker-backup.json') => {
    const token = accessTokenRef.current;
    if (!token) throw new Error('Not signed in');

    setIsLoading(true);
    try {
      const searchRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
          `name='${filename}' and trashed=false`
        )}&fields=files(id,name,modifiedTime)`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const searchData = await searchRes.json();
      const file: DriveFile | undefined = searchData.files?.[0];
      if (!file) throw new Error('No backup found');

      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      return await res.text();
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isSignedIn,
    isLoading,
    lastError,
    initClient,
    signIn,
    signOut,
    uploadFile,
    downloadFile,
  };
}

declare global {
  interface Window {
    google: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: TokenResponse) => void;
          }) => TokenClient;
          revoke: (token: string, done: () => void) => void;
        };
      };
    };
  }
}
