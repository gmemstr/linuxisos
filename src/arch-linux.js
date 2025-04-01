import { WorkflowEntrypoint } from "cloudflare:workers"
import bencode from 'bencode'

export class ArchLinuxWorkflow extends WorkflowEntrypoint {
	async run (event, step) {
		let hrefs = await step.do("fetch iso and torrent hrefs", async () => {
			const res = await fetch('https://archlinux.org/download/', {
				headers: { 'User-Agent': 'LinuxISOs Scraper (linuxisos@gmem.ca)' },
			});

			let torrentUrl = "";
			let directUrl = "";
			const rewriter = new HTMLRewriter()
				.on('a[title="Download torrent"]', {
					element(element) {
						torrentUrl = `https://archlinux.org${element.getAttribute('href')}`;
					},
				})
				.on('a[title="Download from https://geo.mirror.pkgbuild.com/"]', {
					element(element) {
						directUrl = element.getAttribute('href');
					},
				});

			const _ = await rewriter.transform(res).arrayBuffer();

			return { torrent: torrentUrl, direct: directUrl }
		});
		let torrentFilename = await step.do("get torrent url", async () => {
			const torrentFile = await fetch(hrefs.torrent, {
				headers: { 'User-Agent': 'LinuxISOs Scraper (linuxisos@gmem.ca)' },
			});
			return torrentFile.headers.get('content-disposition')
				.split(';')
				.find(n => n.includes('filename='))
				.replace('filename=', '')
				.trim();
		});

		let directFilename = await step.do("get direct download url", async () => {
			const directFile = await fetch(hrefs.direct, {
				headers: { 'User-Agent': 'LinuxISOs Scraper (linuxisos@gmem.ca)' },
			});
			let directFilename = "";
			const directRewriter = new HTMLRewriter()
				.on(`a[href="${torrentFilename.replace('.torrent', '')}"]`, {
					element(element) {
						directFilename = element.getAttribute('href');
					},
				})
			await directRewriter.transform(directFile).arrayBuffer();
			if (directFilename != torrentFilename.replace('.torrent', '')) {
				return "";
			}

			return directFilename;
		});

		let final = await step.do("collect results", async () => {
			let final = {};
			final["version"] = torrentFilename.split('-')[1];
			final[torrentFilename.replace('.torrent', '')] = {
				torrent: hrefs.torrent,
				direct: `${hrefs.direct}${directFilename}`,
				arch: "amd64"
			};
			return final;
		});

		await step.do("download and modify torrents", async () => {
			if (await this.env.R2.get(torrentFilename) !== null) {
				console.log("torrent file already exists in r2");
				return;
			}
			const torrents = Object.values(final).filter((file) => { return file.torrent !== undefined }).map((file) => {
				return file.torrent;
			})
			for (const torrent of torrents) {
				const resp = await fetch(torrent);
				const buff = await resp.arrayBuffer();
				const b2 = Buffer.from(new  Uint8Array(buff));
				const result = bencode.decode(b2);
				if (!result.hasOwnProperty('announce-list')) {
					result['announce-list'] = [];
				}
				result['announce-list'].push(['https://linuxisos-tracker.gmem.ca/announce']);

				const encodedTorrent = bencode.encode(result);
				this.env.R2.put(torrentFilename, encodedTorrent);
			}
		});
	}
}
