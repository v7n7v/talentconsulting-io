const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBodies, runtime } = require('./test-ui-hooks.cjs');

const component = loadBodies('app/suite/job-search/JobPreferencesPanel.tsx');
const response = body => ({ ok: true, status: 200, json: async () => body });
const deferred = () => {
  let resolve;
  const promise = new Promise(yes => { resolve = yes; });
  return { promise, resolve };
};

async function setup(props = {}) {
  globalThis.resolveAlertConsentHandoff = ({ loaded, canPersist, saving, targetRoles, roleInput, suggestedTargetRole }) => {
    const existingRole = targetRoles.length > 0 || Boolean(roleInput.trim());
    const suggestedRole = loaded && !existingRole ? (suggestedTargetRole || '').trim() : '';
    return { suggestedRole, saveDisabled: !loaded || !canPersist || saving || (!existingRole && !suggestedRole) };
  };
  globalThis.analytics = { preferencesSaved() {} };
  const loaded = [];
  const applied = [];
  const closed = [];
  const ui = runtime((await component).default, {
    visible: true,
    onPrefsLoaded: value => loaded.push(value),
    onPrefsApplied: value => applied.push(value),
    onClose: () => closed.push(true),
    ...props,
  });
  ui.user = { uid: 'alice', accessToken: 'fake-token' };
  return { ui, loaded, applied, closed };
}

function saveButton(ui) {
  return ui.find(node => node.type === 'button'
    && JSON.stringify(node.props.children).includes('Save Profile & Get Suggestions'));
}

test('initial GET hydrates only; explicit successful save invokes the applied callback', async () => {
  const { ui, loaded, applied, closed } = await setup({ suggestedTargetRole: 'Product Manager' });
  const oldFetch = global.fetch;
  const requests = [];
  global.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    return options.method === 'POST'
      ? response({ success: true })
      : response({ success: true, isNew: false, preferences: { targetRoles: ['Product Manager'] } });
  };

  try {
    ui.flush();
    await ui.settle();
    assert.equal(loaded.length, 1);
    assert.deepEqual(loaded[0].targetRoles, ['Product Manager']);
    assert.deepEqual(applied, [], 'hydration must not apply preferences or close Controls');
    assert.deepEqual(closed, []);

    const save = saveButton(ui);
    assert.equal(save.props.disabled, false);
    await save.props.onClick();
    ui.flush();
    assert.equal(requests.filter(request => request.options.method === 'POST').length, 1);
    assert.deepEqual(applied[0].targetRoles, ['Product Manager']);
    assert.equal(applied.length, 1);
    assert.deepEqual(closed, [true]);
  } finally {
    global.fetch = oldFetch;
    ui.unmount();
  }
});

test('failed explicit save preserves hydrated values and does not apply or close', async () => {
  const { ui, loaded, applied, closed } = await setup();
  const oldFetch = global.fetch;
  global.fetch = async (_url, options = {}) => options.method === 'POST'
    ? response({ success: false, error: 'Temporary save failure' })
    : response({ success: true, isNew: false, preferences: { targetRoles: ['Existing Role'] } });

  try {
    ui.flush();
    await ui.settle();
    assert.equal(loaded.length, 1);
    assert.deepEqual(loaded[0].targetRoles, ['Existing Role']);

    const roleInput = ui.find(node => node.type === 'input' && node.props.placeholder === 'Add more...');
    roleInput.props.onChange({ target: { value: 'New Role' } });
    ui.flush();
    await saveButton(ui).props.onClick();
    ui.flush();

    assert.match(ui.text(), /Existing Role/, 'saved role remains visible after failure');
    assert.match(ui.text(), /New Role/, 'pending role committed for the request remains visible after failure');
    assert.deepEqual(applied, []);
    assert.deepEqual(closed, []);
  } finally {
    global.fetch = oldFetch;
    ui.unmount();
  }
});

test('legacy consumers receive explicit apply through the load callback fallback', async () => {
  const { ui, loaded, closed } = await setup({ onPrefsApplied: undefined, suggestedTargetRole: 'Analyst' });
  const oldFetch = global.fetch;
  global.fetch = async (_url, options = {}) => options.method === 'POST'
    ? response({ success: true })
    : response({ success: true, isNew: false, preferences: { targetRoles: ['Analyst'] } });

  try {
    ui.flush();
    await ui.settle();
    assert.equal(loaded.length, 1, 'GET notifies legacy consumers once for hydration');
    await saveButton(ui).props.onClick();
    assert.equal(loaded.length, 2, 'successful explicit save falls back to the legacy callback');
    assert.deepEqual(loaded[1].targetRoles, ['Analyst']);
    assert.deepEqual(closed, [true]);
  } finally {
    global.fetch = oldFetch;
    ui.unmount();
  }
});

test('late save for account A cannot apply or close after the panel changes to account B', async () => {
  const { ui, applied, closed } = await setup({ suggestedTargetRole: 'Product Manager' });
  const oldFetch = global.fetch;
  const pending = deferred();
  global.fetch = async (_url, options = {}) => options.method === 'POST'
    ? pending.promise
    : response({ success: true, isNew: false, preferences: { targetRoles: ['Current Account Role'] } });

  try {
    ui.flush();
    await ui.settle();
    const saving = saveButton(ui).props.onClick();
    ui.flush();
    ui.user = { uid: 'bob', accessToken: 'fake-token-b' };
    ui.flush();
    await ui.settle();
    pending.resolve(response({ success: true }));
    await saving;
    ui.flush();
    assert.deepEqual(applied, []);
    assert.deepEqual(closed, []);
    assert.match(ui.text(), /Current Account Role/, 'the new account hydration remains visible');
  } finally {
    global.fetch = oldFetch;
    ui.unmount();
  }
});

test('late save after unmount cannot apply preferences or close the departed panel', async () => {
  const { ui, applied, closed } = await setup({ suggestedTargetRole: 'Product Manager' });
  const oldFetch = global.fetch;
  const pending = deferred();
  global.fetch = async (_url, options = {}) => options.method === 'POST'
    ? pending.promise
    : response({ success: true, isNew: false, preferences: { targetRoles: ['Product Manager'] } });

  try {
    ui.flush();
    await ui.settle();
    const saving = saveButton(ui).props.onClick();
    ui.flush();
    ui.unmount();
    pending.resolve(response({ success: true }));
    await saving;
    assert.deepEqual(applied, []);
    assert.deepEqual(closed, []);
  } finally {
    global.fetch = oldFetch;
  }
});

test('successful response does not apply an older draft over edits made while saving', async () => {
  const { ui, applied, closed } = await setup({ suggestedTargetRole: 'Product Manager' });
  const oldFetch = global.fetch;
  const pending = deferred();
  global.fetch = async (_url, options = {}) => options.method === 'POST'
    ? pending.promise
    : response({ success: true, isNew: false, preferences: { targetRoles: ['Product Manager'] } });

  try {
    ui.flush();
    await ui.settle();
    const saving = saveButton(ui).props.onClick();
    ui.flush();
    ui.find(node => node.type === 'input' && node.props.placeholder === 'Add more...')
      .props.onChange({ target: { value: 'New Role' } });
    ui.flush();
    pending.resolve(response({ success: true }));
    await saving;
    ui.flush();
    assert.deepEqual(applied, []);
    assert.deepEqual(closed, []);
    assert.match(ui.text(), /New Role/);
    assert.match(ui.text(), /newer edits remain/);
  } finally {
    global.fetch = oldFetch;
    ui.unmount();
  }
});

test('account switch clears unsaved role and city drafts before the next account can save', async () => {
  const { ui } = await setup();
  const oldFetch = global.fetch;
  const posts = [];
  global.fetch = async (_url, options = {}) => {
    if (options.method === 'POST') {
      posts.push(JSON.parse(options.body));
      return response({ success: true });
    }
    const isBob = options.headers?.Authorization === 'Bearer token-b';
    return response({ success: true, isNew: false, preferences: isBob
      ? { targetRoles: ['B Saved Role'], preferredCities: ['B City'] }
      : { targetRoles: ['A Saved Role'], preferredCities: ['A City'] } });
  };

  try {
    ui.flush();
    await ui.settle();
    const addMoreInputs = () => ui.nodes().filter(node => node.type === 'input' && node.props.placeholder === 'Add more...');
    let inputs = addMoreInputs();
    inputs[0].props.onChange({ target: { value: 'A Unsaved Role' } });
    inputs[1].props.onChange({ target: { value: 'A Unsaved City' } });
    ui.flush();

    ui.user = { uid: 'bob', accessToken: 'token-b' };
    ui.flush();
    await ui.settle();
    inputs = addMoreInputs();
    assert.equal(inputs[0].props.value, '');
    assert.equal(inputs[1].props.value, '');
    await saveButton(ui).props.onClick();

    assert.equal(posts.length, 1);
    assert.deepEqual(posts[0].targetRoles, ['B Saved Role']);
    assert.deepEqual(posts[0].preferredCities, ['B City']);
    assert.equal(JSON.stringify(posts[0]).includes('A Unsaved'), false);
  } finally {
    global.fetch = oldFetch;
    ui.unmount();
  }
});
