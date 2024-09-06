import { NextRequest, NextResponse } from "next/server";
import { PlaywrightCrawler } from "crawlee";

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

  try {
    let videos: VideoData[] = [];

    const crawler = new PlaywrightCrawler({
      launchContext: {
        launchOptions: {
          headless: true,
        },
      },
      async requestHandler({ page, log }) {
        log.info(`Processing ${page.url()}`);

        await page.waitForSelector("#contents ytd-playlist-video-renderer");

        const scrollAndLoad = async () => {
          let previousHeight = 0;
          while (true) {
            await page.evaluate(() =>
              window.scrollTo(0, document.body.scrollHeight)
            );
            await page.waitForTimeout(2000);
            const newHeight = await page.evaluate(
              () => document.body.scrollHeight
            );
            if (newHeight === previousHeight) {
              break;
            }
            previousHeight = newHeight;
          }
        };

        // Scroll to load all videos
        await scrollAndLoad();

        // Extract video data
        videos = await page.evaluate(() => {
          const elements = Array.from(
            document.querySelectorAll("#contents ytd-playlist-video-renderer")
          );
          return elements.map((el): VideoData => {
            const title =
              el.querySelector("#video-title")?.textContent?.trim() || "";
            const videoInfoElement = el.querySelector("#video-info");
            const viewsText =
              videoInfoElement?.querySelector("span")?.textContent?.trim() ||
              "";
            const thumbnail = el.querySelector("img")?.src || "";

            const viewsMatch = viewsText.match(/^([\d,.]+[KMB]?)\s*views?$/i);
            let views = 0;
            if (viewsMatch) {
              const viewString = viewsMatch[1].toUpperCase().replace(/,/g, "");
              if (viewString.endsWith("K")) {
                views = parseFloat(viewString) * 1000;
              } else if (viewString.endsWith("M")) {
                views = parseFloat(viewString) * 1000000;
              } else if (viewString.endsWith("B")) {
                views = parseFloat(viewString) * 1000000000;
              } else {
                views = parseInt(viewString);
              }
            }

            return { title, views, thumbnail };
          });
        });

        log.info(`Found ${videos.length} videos in the playlist`);
      },
    });

    await crawler.run([playlistUrl]);

    const graphData = videos.map((video, index) => ({
      name: `Video ${index + 1}`,
      views: video.views,
    }));

    return NextResponse.json({
      videoList: videos,
      graphData: graphData,
    });
  } catch (error) {
    console.error("Crawling failed:", error);
    return NextResponse.json(
      { error: "An error occurred while scraping the playlist" },
      { status: 500 }
    );
  }
}
