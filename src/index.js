import { DebianWorkflow } from "./debian";
import { ArchLinuxWorkflow } from "./arch-linux";
import { Hono } from 'hono'
import { Feed } from 'feed';

export { DebianWorkflow, ArchLinuxWorkflow };

const app = new Hono()

app.get('/', async (c) => {
	let response = await c.env.ASSETS.fetch(c.req.raw);
	if (response.status !== 200) {
		return response;
	}
	const torrents = await c.env.R2.list();
	let list = '';
	for (const torrent of torrents.objects) {
		list += `<a href="https://linuxtorrents.gmem.ca/${torrent.key}"><li>📂 ${torrent.key}</li></a>`
	}

	return new HTMLRewriter()
		.on("ul", {
			element(element) {
				element.setInnerContent(list, {html: true});
			}
		})
		.transform(response);
});

app.get('/atom', async (c) => {
	return new Response((await buildFeed(c.env)).atom1(), {headers: { 'Content-Type': 'application/atom+xml' }});
});

app.get('/rss', async (c) => {
	return new Response((await buildFeed(c.env)).rss2(), {headers: { 'Content-Type': 'application/atom+xml' }});
});

app.get('/*', async (c) => {
	return await c.env.ASSETS.fetch(c.req.raw);
});

async function buildFeed(env) {
	const feed = new Feed({
		title: "gmem's Linux ISOs Tracker",
		description: "Tracking Linux ISO torrents for download.",
		id: "https://linuxisos.gmem.ca",
		link: "https://linuxisos.gmem.ca",
		generator: "linuxisos.gmem.ca",
		feedLinks: {
			rss: "https://linuxisos.gmem.ca/rss",
			atom: "https://linuxisos.gmem.ca/atom"
		},
		author: {
			name: "Arch Retriever",
			email: "linuxisos@gmem.ca",
			link: "https://arch.dog"
		}
	});
	const torrents = await env.R2.list();
	torrents.objects.forEach(torrent => {
		feed.addItem({
			title: torrent.key,
			id: torrent.key,
			link: `https://linuxtorrents.gmem.ca/${torrent.key}`,
			description: '',
			content: '',
			date: torrent.uploaded
		});
	});

	return feed;
}

export default {
	fetch: app.fetch,
	async scheduled(event, env, ctx) {
		let newId = await crypto.randomUUID();
		let debian = await env.DEBIAN_WORKFLOW.create({ id: newId });
		console.log(`started ${newId} of debian workflow`);
		newId = await crypto.randomUUID();
		let arch = await env.ARCHLINUX_WORKFLOW.create({ id: newId });
		console.log(`started ${newId} of archlinux workflow`);
	}
}
