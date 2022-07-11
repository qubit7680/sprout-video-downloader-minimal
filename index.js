import fetch from "node-fetch";
import { parse } from "node-html-parser";
import { Parser as PlaylistParser } from "m3u8-parser";
import { writeFileSync } from "fs";

const url = process.argv.slice(2)[0];

if (!url) {
  console.log("Please specify an URL");
  process.exit(0);
}

// Kinda obfuscated... unintentionally!
function getQueries(data) {
  // m = *.m3u8, k = *.key, t = *.ts
  const signatures = ["m", "k", "t"];
  const names = ["Policy", "Signature", "Key-Pair-Id"];
  const keys = names.map((n) => "CloudFront-" + n);

  const queries = signatures.map((s) => {
    const parameters = keys.map(
      (k, i) => names[i] + "=" + data.signatures[s][k]
    );
    parameters.push("sessionID=" + data.sessionID);
    return parameters.join("&");
  });

  return queries;
}

async function request(url) {
  const response = await fetch(url);
  return await response.text();
}

(async () => {
  console.log("Fetching page...");
  const response = await fetch(url);
  const page = await response.text();
  const embedURL = parse(page).querySelector("iframe").getAttribute("src");

  console.log("Fetching embed...");
  const embedResponse = await fetch(embedURL);
  const embedPage = await embedResponse.text();
  const dat = parse(embedPage)
    .querySelector("script")
    .innerText.match(/'(.*)'/)[1];

  const data = JSON.parse(Buffer.from(dat, "base64").toString());

  const [playlistQuery, keyQuery, segmentQuery] = getQueries(data);

  const playlistBase = `https://hls2.videos.sproutvideo.com/${data.s3_user_hash}/${data.s3_video_hash}/video/`;

  const manifestURL = playlistBase + "index.m3u8?" + playlistQuery;
  const manifestContent = await request(manifestURL);

  const manifestParser = new PlaylistParser();
  manifestParser.push(manifestContent);
  manifestParser.end();

  const bestQuality = manifestParser.manifest.playlists.reduce(
    (prev, current) => {
      return prev.attributes.BANDWIDTH > current.attributes.BANDWIDTH
        ? prev
        : current;
    }
  );

  const dimensions = `${bestQuality.attributes.RESOLUTION.width}x${bestQuality.attributes.RESOLUTION.height}`;
  console.log("Best quality found:", dimensions);

  const qualityID = bestQuality.uri.split(".")[0];

  const playlistURL = playlistBase + bestQuality.uri + "?" + playlistQuery;
  const playlistContent = await request(playlistURL);

  const keyURL = playlistBase + qualityID + ".key?" + keyQuery;
  const playlistContentCorrected = playlistContent
    .split("\n")
    .map((line) => {
      if (line.match(/^#/) || line === "") {
        return line;
      }
      return playlistBase + line + "?" + segmentQuery;
    })
    .join("\n")
    .replace(qualityID + ".key", keyURL);

  writeFileSync("output.m3u8", playlistContentCorrected);
  console.log("Saved playlist to output.m3u8");
  console.log("To download run:");
  console.log(
    "ffmpeg -protocol_whitelist file,http,https,tcp,tls,crypto -i output.m3u8 -c copy video.mp4"
  );
})();
