import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: { remotePatterns: [{protocol:"https", hostname:"s4.anilist.co"}, {protocol:"https", hostname:"cdn.anilist.co"}, {protocol:"https", hostname:"example.com"}] },
  compress: true,
  async headers(){
    return [{source:"/(.*)", headers:[
      {key:"Strict-Transport-Security", value:"max-age=63072000; includeSubDomains; preload"},
      {key:"Content-Security-Policy", value:"default-src 'self'; img-src 'self' https: data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"},
      {key:"X-Frame-Options", value:"SAMEORIGIN"},
      {key:"X-Content-Type-Options", value:"nosniff"},
    ]}];
  },
};

export default nextConfig;
