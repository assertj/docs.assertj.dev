'use strict'

const assert = require('node:assert')
const { test } = require('node:test')
const { outdated, versionSegment } = require('./latest-patch')

const bucket = (name, refname, tag = refname) => ({ name, origins: [{ refname, tag }] })
const branch = (name, refname) => ({ name, origins: [{ refname, branch: refname }] })
const dropped = (buckets) => outdated(buckets).map(({ origin }) => origin.refname).sort()

test('drops all but the highest patch of a line', () => {
  const tags = [8, 0, 10, 2].map((patch) => bucket('core', `assertj-build-3.27.${patch}`))
  assert.deepStrictEqual(dropped(tags), ['assertj-build-3.27.0', 'assertj-build-3.27.2', 'assertj-build-3.27.8'])
})

test('keeps the latest patch of each line and of each component', () => {
  const tags = [
    bucket('core', 'assertj-build-3.27.8'),
    bucket('core', 'assertj-build-4.0.0'),
    bucket('guava', 'assertj-build-3.27.1'),
  ]
  assert.deepStrictEqual(dropped(tags), [])
})

test('drops milestones and release candidates once something newer is tagged', () => {
  const tag = (version) => bucket('core', `assertj-build-${version}`)
  assert.deepStrictEqual(dropped([tag('4.0.0-M2'), tag('4.0.0-M10'), tag('4.0.0-M1')]), [
    'assertj-build-4.0.0-M1',
    'assertj-build-4.0.0-M2',
  ])
  assert.deepStrictEqual(dropped([tag('4.0.0-RC1'), tag('4.0.0-M2')]), ['assertj-build-4.0.0-M2'])
  assert.deepStrictEqual(dropped([tag('4.0.0'), tag('4.0.0-RC1')]), ['assertj-build-4.0.0-RC1'])
  assert.deepStrictEqual(dropped([tag('4.0.1-M1'), tag('4.0.0')]), ['assertj-build-4.0.0'])
})

test('leaves refs that do not end in a version alone', () => {
  const refs = [
    bucket('core', 'assertj-build-4.0.1'),
    bucket('core', 'assertj-build-4.0.2-beta'),
    branch('core', 'main'),
    branch('core', '4.0.x'),
    branch('core', '3.x'),
  ]
  assert.deepStrictEqual(dropped(refs), [])
})

test('treats a branch that ends in a version like a tag', () => {
  const refs = [branch('core', 'antora/3.27.8'), branch('core', 'antora/3.27.9'), bucket('core', 'assertj-build-3.27.7')]
  assert.deepStrictEqual(dropped(refs), ['antora/3.27.8', 'assertj-build-3.27.7'])
  assert.deepStrictEqual(dropped([branch('core', 'antora/3.27.9'), bucket('core', 'assertj-build-3.27.10')]), [
    'antora/3.27.9',
  ])
})

test('prefers the branch over the tag of the same version', () => {
  const tag = bucket('core', 'assertj-build-3.27.9')
  const backport = branch('core', 'antora/3.27.9')
  assert.deepStrictEqual(dropped([tag, backport]), ['assertj-build-3.27.9'])
  assert.deepStrictEqual(dropped([backport, tag]), ['assertj-build-3.27.9'])
})

test('handles refs that share a bucket because they declare the same version', () => {
  const tag = { refname: 'assertj-build-3.27.9', tag: 'assertj-build-3.27.9' }
  const backport = { refname: 'antora/3.27.9', branch: 'antora/3.27.9' }
  const shared = { name: 'core', origins: [tag, backport] }
  assert.deepStrictEqual(outdated([shared]), [{ bucket: shared, origin: tag, rank: [9, 2, 0, 0] }])
})

test('publishes a release under major.minor', () => {
  assert.strictEqual(versionSegment({ version: '3.27.8' }), '3.27')
})

test('publishes a milestone or release candidate under major.minor', () => {
  assert.strictEqual(versionSegment({ version: '4.0.0-M1', prerelease: true }), '4.0')
  assert.strictEqual(versionSegment({ version: '4.0.0-RC2', prerelease: true }), '4.0')
})

test('publishes a snapshot next to its release line', () => {
  assert.strictEqual(versionSegment({ version: '3.27.9', prerelease: '-SNAPSHOT' }), '3.27-SNAPSHOT')
})

test('leaves unversioned components alone', () => {
  assert.strictEqual(versionSegment({ version: '' }), undefined)
})
