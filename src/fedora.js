import { WorkflowEntrypoint } from "cloudflare:workers"
import bencode from 'bencode'

export class FedoraWorkflow extends WorkflowEntrypoint {
	async run(event, step) {
		let torrents = await step.do("fetch iso and torrent hrefs", async () => {
			const res = await fetch('https://torrent.fedoraproject.org/', {
				headers: { 'User-Agent': 'LinuxISOs Scraper (linuxisos@gmem.ca)' },
			});

			const torrents = [];
			const rewriter = new HTMLRewriter()
				.on('a[href$=".torrent"]', {
					element(element) {
						torrents.push(element.getAttribute('href'));
					},
				})

			const _ = await rewriter.transform(res).arrayBuffer();

			return torrents;
		});

		await step.do("download and modify torrents", async () => {
			for (const torrent of torrents) {
				// Parse out filename from torrent URL
				const torrentUrl = new URL(torrent);
				const torrentFilename = torrentUrl.pathname.split('/').pop();

				if (await this.env.R2.get(torrentFilename) !== null) {
					console.log("torrent file already exists in r2");
					continue;
				}

				const resp = await fetch(torrent);
				const buff = await resp.arrayBuffer();
				const b2 = Buffer.from(new  Uint8Array(buff));
				const result = bencode.decode(b2);
				if (!result.hasOwnProperty('announce-list')) {
					result['announce-list'] = [];
				}
				result['announce-list'].push(['https://linuxisos-tracker.gmem.ca/announce']);
				if (result.hasOwnProperty('announce') && result['announce'] !== "") {
					result['announce-list'].push([result['announce']]);
					delete result['announce'];
				}

				const encodedTorrent = bencode.encode(result);
				this.env.R2.put(torrentFilename, encodedTorrent);
			}
		});
	}
}
