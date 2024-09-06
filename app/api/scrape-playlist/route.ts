import { NextRequest, NextResponse } from "next/server";
import { PlaywrightCrawler, Dataset } from "crawlee";

interface VideoData {
  title: string;
  views: number;
  thumbnail: string;
}

export async function POST(request: NextRequest) {
  const { playlistUrl } = await request.json();

  if (!playlistUrl) {
    return NextResponse.json(
      { error: "Playlist URL is required" },
      { status: 400 }
    );
  }

  const dataset = await Dataset.open(`playlist-${Date.now()}`);

  const crawler = new PlaywrightCrawler({
    maxRequestsPerCrawl: 50,

    async requestHandler({ request, page, log }) {
      log.info(`Processing ${request.url}...`);

      await page.waitForSelector("#contents ytd-playlist-video-renderer", {
        timeout: 30000,
      });

      // Scroll to load all videos
      await page.evaluate(async () => {
        while (true) {
          const oldHeight = document.body.scrollHeight;
          window.scrollTo(0, document.body.scrollHeight);
          await new Promise((resolve) => setTimeout(resolve, 2000));
          if (document.body.scrollHeight === oldHeight) break;
        }
      });

      const videos: VideoData[] = await page.$$eval(
        "#contents ytd-playlist-video-renderer",
        (elements) => {
          return elements.map((el) => {
            const title =
              el.querySelector("#video-title")?.textContent?.trim() || "";
            const viewsText =
              el.querySelector("#video-info span")?.textContent?.trim() || "";
            const thumbnail = el.querySelector("img")?.src || "";

            const viewsMatch = viewsText.match(/^([\d,.]+[KMB]?)\s*views?$/i);
            let views = 0;
            if (viewsMatch) {
              const viewString = viewsMatch[1].toUpperCase().replace(/,/g, "");
              if (viewString.endsWith("K"))
                views = parseFloat(viewString) * 1000;
              else if (viewString.endsWith("M"))
                views = parseFloat(viewString) * 1000000;
              else if (viewString.endsWith("B"))
                views = parseFloat(viewString) * 1000000000;
              else views = parseInt(viewString);
            }

            return { title, views, thumbnail };
          });
        }
      );

      log.info(`Found ${videos.length} videos in the playlist`);

      await dataset.pushData({ videos });
    },

    failedRequestHandler({ request, log }) {
      log.error(`Request ${request.url} failed too many times.`);
    },
  });

  try {
    await crawler.run([playlistUrl]);

    const results = await dataset.getData();
    const videos = (results.items[0]?.videos as VideoData[]) || [];

    const graphData = videos.map((video, index) => ({
      name: `Video ${index + 1}`,
      views: video.views,
    }));

    await dataset.drop();

    return NextResponse.json({
      videoList: videos,
      graphData: graphData,
    });
  } catch (error) {
    console.error("Crawling failed:", error);
    await dataset.drop();
    return NextResponse.json(
      { error: "An error occurred while scraping the playlist" },
      { status: 500 }
    );
  }
}
