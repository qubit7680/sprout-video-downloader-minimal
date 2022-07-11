# Sprout video "downloader"
Before using, install required libraries:

```bash
npm install
```

Then use:

```bash
node index.js <url>
```
This will save a proper HLS playlist file as `output.m3u8`. 
Then actually download with ffmpeg:

```bash
ffmpeg -protocol_whitelist file,http,https,tcp,tls,crypto -i output.m3u8 -c copy video.mp4
```
Keep in mind this doesn't accept embed URLs (like: https://videos.sproutvideo.com/embed/012345789abcdef)