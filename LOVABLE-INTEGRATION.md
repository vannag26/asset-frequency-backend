# Connecting Your Lovable App to the Oracle Cloud Backend

## 1. Add the API base URL to Lovable

In your Lovable project, open the chat and type:

```
Add an environment variable VITE_API_URL = "https://api.theassetfrequency.com"
```

Then wherever your app fetches data, use:
```js
const API = import.meta.env.VITE_API_URL;
```

---

## 2. Authenticated API calls (all routes need a JWT)

The Supabase session token works directly with this backend. Use it like this:

```js
import { supabase } from '@/integrations/supabase/client';

async function fetchMarketSnapshot() {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const res = await fetch(`${API}/api/market/snapshot`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.json();
}
```

---

## 3. Real-time WebSocket (paid subscribers only)

Add this hook to your Lovable project — paste it in the Lovable chat:

```
Create a React hook called useRealtimeFeed that:
- Gets the Supabase session token
- Opens a WebSocket to wss://api.theassetfrequency.com/live?token=<TOKEN>
- Listens for market:update and oracle:signal events
- Returns { data, connected, error }
- Only runs if the user has subscription_tier !== 'free'
```

Or add this code directly to your project:

```js
// src/hooks/useRealtimeFeed.js
import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useRealtimeFeed() {
  const [data, setData]           = useState(null);
  const [connected, setConnected] = useState(false);
  const [error, setError]         = useState(null);
  const wsRef = useRef(null);

  useEffect(() => {
    let ws;

    async function connect() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const tier = session.user?.user_metadata?.subscription_tier;
      if (tier === 'free' || !tier) return; // Free users don't get WS

      const url = `${import.meta.env.VITE_WS_URL || 'wss://api.theassetfrequency.com'}/live?token=${session.access_token}`;
      ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen  = ()    => setConnected(true);
      ws.onclose = ()    => setConnected(false);
      ws.onerror = (e)   => setError('Connection error');
      ws.onmessage = (e) => {
        try { setData(JSON.parse(e.data)); }
        catch {}
      };
    }

    connect();
    return () => ws?.close();
  }, []);

  return { data, connected, error };
}
```

Use it in your Oracle or Market components:
```js
const { data, connected } = useRealtimeFeed();
```

---

## 4. Route mapping

| Lovable Page  | API Endpoint                        | Auth         |
|---------------|-------------------------------------|--------------|
| Home/Dashboard| GET /api/market/snapshot            | Any user     |
| Industries    | GET /api/industries                 | Any user     |
| Industries/:s | GET /api/industries/:sector         | Any user     |
| Oracle        | GET /api/oracle/signals             | Any user     |
| Oracle detail | GET /api/oracle/signals/:id         | Paid only    |
| Strategy      | GET /api/strategy/playbooks         | Any user     |
| Strategy full | GET /api/strategy/playbooks/:id     | Paid only    |
| Live feed     | WSS /live                           | Paid only    |

---

## 5. Checking user tier in Lovable

```js
const { data: { session } } = await supabase.auth.getSession();
const tier = session?.user?.user_metadata?.subscription_tier || 'free';
const isPaid = tier !== 'free';
```

Use `isPaid` to show/hide upgrade prompts and the real-time feed UI.

---

## 6. Setting subscription tier after payment

When a user completes a Stripe payment, call your Supabase edge function to update their tier:

```js
await supabase.auth.updateUser({
  data: { subscription_tier: 'pro' }
});
```

The backend reads this from the JWT `user_metadata` — no changes needed server-side.
