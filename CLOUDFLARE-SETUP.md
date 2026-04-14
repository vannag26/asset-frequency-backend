# CLOUDFLARE-SETUP.md
Run these commands once to set up your permanent tunnel:

1. cloudflared tunnel login
2. cloudflared tunnel create asset-frequency
3. cloudflared tunnel route dns asset-frequency api.theassetfrequency.com

Create ~/.cloudflared/config.yml:
  tunnel: <TUNNEL_ID>
  credentials-file: /Users/<USERNAME>/.cloudflared/<TUNNEL_ID>.json
  ingress:
    - hostname: api.theassetfrequency.com
      service: http://localhost:80
    - service: http_status:404

4. cloudflared tunnel run asset-frequency

Quick test (no domain needed):
  cloudflared tunnel --url http://localhost:80