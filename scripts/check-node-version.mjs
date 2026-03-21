const [major] = process.versions.node.split('.').map(Number);

const supported = major >= 20 && major < 24;

if (!supported) {
    console.error(
        [
            `Unsupported Node.js version: v${process.versions.node}.`,
            'Use Node.js 20.x or 22.x LTS for this repository.',
            'Node.js 24 can break Next.js 14 builds with missing .next manifest errors.',
            'After switching Node versions, remove frontend/.next and restart the frontend.',
        ].join('\n'),
    );
    // process.exit(1);
}
