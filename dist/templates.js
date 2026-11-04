const station = (id, x, y, name, description, labelPosition = 'top') => ({
  id, x, y, name, description, labelPosition, labelAngle: 0,
  kind: 'station', url: '',
});

const line = (id, name, code, color, nodeIds) => ({
  id, name, code, color, nodeIds, width: 6, style: 'solid', visible: true,
});

const creative = {
  version: 1,
  title: 'The creative journey',
  subtitle: 'Good ideas have more than one route.',
  theme: 'paper',
  nodes: [
    station('c-curiosity', 80, 300, 'Stay curious', 'Start with something that makes you curious. Write down a question you would enjoy exploring, without trying to answer it yet.'),
    station('c-collect', 240, 300, 'Collect inspiration', 'Gather references, observations, and conversations. Look beyond your usual sources and keep a small collection of things that surprise you.', 'bottom'),
    station('c-patterns', 380, 300, 'Find patterns', 'Lay out what you have collected. Group similar observations and name the patterns that keep appearing.'),
    station('c-idea', 500, 300, 'The big idea', 'This is your interchange. Bring together what you have noticed, imagined, made, and learned. Describe the core idea in one clear sentence.', 'bottom'),
    station('c-possibilities', 660, 300, 'Explore possibilities', 'Generate several ways the idea could take shape. Sketch quickly and give unusual options a little room before choosing.', 'bottom'),
    station('c-prototype', 820, 300, 'Make it tangible', 'Build the smallest version that lets someone experience the idea. A sketch, paper model, or short walkthrough is enough to begin.'),
    station('c-share', 960, 300, 'Share the work', 'Put the work in front of someone. Explain the question you are exploring, then let them respond in their own words.', 'bottom'),

    station('c-question', 160, 60, 'A better question', 'Reframe the challenge as a question. Make it specific enough to guide the work and open enough to allow more than one answer.'),
    station('c-listen', 280, 180, 'Listen closely', 'Talk with the people involved. Ask about a recent real experience and pay attention to what they do as well as what they say.', 'left'),
    station('c-define', 380, 180, 'Define the problem', 'Choose one problem worth solving. Write down who experiences it, what gets in their way, and why a change would matter.'),
    station('c-test', 620, 420, 'Test an assumption', 'Name the assumption most likely to change your direction. Design a small test that could reveal whether it holds.', 'top'),
    station('c-feedback', 740, 420, 'Gather feedback', 'Invite specific feedback: what felt clear, what caused friction, and what someone expected to happen next.', 'bottom'),
    station('c-learning', 860, 540, 'Keep the learning', 'Record what changed your mind. Keep the evidence and the next question together so the next iteration starts with what you learned.', 'right'),

    station('c-intention', 500, 40, 'Set an intention', 'Decide what you hope this work will do for someone. A useful intention helps you make choices when several directions look promising.', 'right'),
    station('c-direction', 500, 140, 'Choose a direction', 'Pick a direction to explore for now. Make the next step small enough that you can learn before committing to the whole journey.', 'left'),
    station('c-focus', 500, 220, 'Find your focus', 'Identify the one thing this version needs to communicate. Remove work that competes with that purpose.', 'right'),
    station('c-build', 500, 440, 'Build a little', 'Turn the idea into something usable, one piece at a time. Finish a small coherent part before widening the scope.', 'left'),
    station('c-refine', 500, 540, 'Refine the details', 'Review the experience from beginning to end. Improve the details that make the work easier to understand and use.', 'left'),
    station('c-release', 580, 620, 'Let it out', 'Share a finished version. Give people a clear way to use it, respond to it, and tell you what they need next.', 'right'),

    station('c-pause', 120, 580, 'Take a pause', 'Step away long enough to notice what you have stopped seeing. A short walk or a night away from the work can reveal a useful next move.', 'left'),
    station('c-reflect', 240, 460, 'Look back', 'Review the journey so far. Notice the decisions that helped, the assumptions that changed, and the questions still open.', 'top'),
    station('c-lens', 340, 460, 'Change the lens', 'Look at the work from another person’s point of view. What becomes obvious, confusing, or valuable from there?', 'bottom'),
    station('c-perspective', 640, 160, 'Fresh perspective', 'Invite someone outside the project to react. Give them enough context to begin, then notice the connections they make on their own.', 'top'),
    station('c-connect', 780, 160, 'Unexpected connections', 'Combine the idea with something from a different field. Look for a useful principle you can borrow and adapt.', 'bottom'),
    station('c-next', 900, 40, 'What comes next?', 'Choose the next question worth following. The end of one route can become the beginning of another.', 'left'),
  ],
  lines: [
    line('c-explore', 'Explore', '01', '#4068E8', ['c-curiosity', 'c-collect', 'c-patterns', 'c-idea', 'c-possibilities', 'c-prototype', 'c-share']),
    line('c-discover', 'Discover', '02', '#E89A38', ['c-question', 'c-listen', 'c-define', 'c-idea', 'c-test', 'c-feedback', 'c-learning']),
    line('c-make', 'Make', '03', '#469B79', ['c-intention', 'c-direction', 'c-focus', 'c-idea', 'c-build', 'c-refine', 'c-release']),
    line('c-reflect-line', 'Reflect', '04', '#A67DB8', ['c-pause', 'c-reflect', 'c-lens', 'c-idea', 'c-perspective', 'c-connect', 'c-next']),
  ],
};

const product = {
  version: 1,
  title: 'Product to launch',
  subtitle: 'From a real problem to something people love.',
  theme: 'night',
  nodes: [
    station('p-signal', 100, 180, 'Find the signal', 'Collect evidence of a problem people already experience. Look for repeated friction rather than an isolated request.'),
    station('p-talk', 260, 180, 'Talk to people', 'Interview a few people who experience the problem. Ask them to walk through the last time it happened.', 'bottom'),
    station('p-scope', 380, 300, 'Frame the opportunity', 'Summarize the user, the problem, and the outcome you hope to improve. Decide what belongs in the first version.'),
    station('p-alignment', 540, 300, 'One shared direction', 'Bring research, design, and engineering together. Agree on the outcome, the smallest useful release, and the assumptions to test.', 'bottom'),
    station('p-beta', 700, 300, 'Private beta', 'Invite a small group to use the product in their normal context. Observe where they succeed and where they need help.'),
    station('p-launch', 880, 300, 'Launch day', 'Release the product with a clear introduction and an easy first step. Make support and feedback easy to find.', 'bottom'),
    station('p-success', 100, 500, 'Define success', 'Choose a small set of observable outcomes. Explain what a useful change would look like for the people using the product.', 'bottom'),
    station('p-sketch', 260, 500, 'Sketch the experience', 'Map the shortest useful journey. Explore several approaches before polishing any one solution.'),
    station('p-prototype', 400, 440, 'Prototype & learn', 'Create a prototype that tests the riskiest part of the experience. Ask someone to complete a realistic task.', 'bottom'),
    station('p-polish', 680, 160, 'Sweat the details', 'Review empty states, errors, loading, keyboard use, and small screens. Polish the moments people rely on every day.'),
    station('p-story', 840, 160, 'Tell the story', 'Explain who the product helps, the problem it solves, and how to get started. Use a concrete example rather than a feature list.'),
    station('p-foundation', 540, 60, 'Lay the foundation', 'Choose a simple technical foundation. Write down the data model, critical constraints, and any dependencies.', 'right'),
    station('p-slice', 540, 160, 'Ship a small slice', 'Build one complete path through the product. Connect the interface and behavior so the team can try a working version.', 'left'),
    station('p-check', 540, 440, 'Check the essentials', 'Verify the main journey, recovery from errors, and the information people need to make decisions.', 'right'),
    station('p-measure', 540, 560, 'Watch & learn', 'Compare real use with the intended outcome. Pair the numbers with conversations so you understand what changed.', 'right'),
    station('p-iterate', 680, 620, 'The next release', 'Choose the next improvement from evidence. Make a clear decision about what to change and what to keep.', 'right'),
  ],
  lines: [
    line('p-discovery', 'Discovery', '01', '#70A8FF', ['p-signal', 'p-talk', 'p-scope', 'p-alignment', 'p-beta', 'p-launch']),
    line('p-design', 'Experience', '02', '#EBAE60', ['p-success', 'p-sketch', 'p-prototype', 'p-alignment', 'p-polish', 'p-story']),
    line('p-delivery', 'Delivery', '03', '#72C6A0', ['p-foundation', 'p-slice', 'p-alignment', 'p-check', 'p-measure', 'p-iterate']),
  ],
};

const blank = {
  version: 1,
  title: 'Untitled map',
  subtitle: 'Every journey starts somewhere.',
  theme: 'paper',
  nodes: [],
  lines: [],
};

const clone = (value) => JSON.parse(JSON.stringify(value));

export const templates = [
  {
    id: 'creative', title: creative.title,
    description: 'Four colorful routes through the creative process.',
    tag: 'Creative process', create: () => clone(creative),
  },
  {
    id: 'product', title: product.title,
    description: 'Connect discovery, experience, and delivery.',
    tag: 'Product roadmap', create: () => clone(product),
  },
  {
    id: 'blank', title: 'Blank canvas',
    description: 'A fresh start for your own connected ideas.',
    tag: 'Start from scratch', create: () => clone(blank),
  },
];
