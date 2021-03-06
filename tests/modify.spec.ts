import { graphql } from 'graphql'
import {
  idArg,
  interfaceType,
  makeSchema,
  NexusGraphQLSchema,
  objectType,
  queryField,
  stringArg,
  nonNull,
  generateSchema,
} from '../src/core'

describe('modify', () => {
  let schema: NexusGraphQLSchema

  beforeAll(() => {
    schema = makeSchema({
      types: [
        interfaceType({
          name: 'Node',
          definition(t) {
            t.id('id', {
              description: 'Some Node ID Description',
              resolve: () => {
                throw new Error('Abstract')
              },
            })
            t.field('subNode', {
              type: 'Node',
            })
          },
          resolveType: (o) => o.__typename,
        }),
        objectType({
          name: 'User',
          definition(t) {
            t.implements('Node')
            t.modify('id', {
              description: 'Some User ID Description',
              resolve: (root) => `User:${root.id}`,
            })
            t.field('subNode', {
              type: 'User',
            })
          },
        }),
        objectType({
          name: 'Throws',
          definition(t) {
            t.implements('Node')
          },
        }),
        objectType({
          name: 'AddArg',
          definition(t) {
            t.implements('Node')
            t.modify('id', {
              args: { someArg: stringArg() },
              resolve: (root, args) => args.someArg ?? `AddArg:${root.id}`,
            })
          },
        }),
        queryField('node', {
          type: 'Node',
          args: {
            id: nonNull(idArg()),
          },
          resolve: (root, args) => {
            const [__typename, id] = args.id.split(':')
            return { __typename, id }
          },
        }),
      ],
      outputs: false,
      shouldGenerateArtifacts: false,
      features: {
        abstractTypeStrategies: {
          resolveType: true,
        },
      },
    })
  })

  it('can modify an existing interface field description', async () => {
    const result = await graphql(
      schema,
      `
        {
          node: __type(name: "Node") {
            fields {
              name
              description
            }
          }
          user: __type(name: "User") {
            fields {
              name
              description
            }
          }
        }
      `
    )
    expect(result.data?.node.fields.find((f: { name: string }) => f.name === 'id').description).toEqual(
      'Some Node ID Description'
    )
    expect(result.data?.user.fields.find((f: { name: string }) => f.name === 'id').description).toEqual(
      'Some User ID Description'
    )
  })

  it('can modify an existing interface field resolve', async () => {
    const result = await graphql(
      schema,
      `
        {
          user: node(id: "User:1") {
            id
          }
          throws: node(id: "Throws:1") {
            id
          }
        }
      `
    )
    expect(result.data?.user.id).toEqual('User:1')
    expect(result.data?.throws.id).toEqual(null)
    expect(result.errors?.[0].message).toEqual('Abstract')
  })

  it('can add additional field args to an interface field', async () => {
    const result = await graphql(
      schema,
      `
        {
          withArg: node(id: "AddArg:1") {
            ... on AddArg {
              id(someArg: "SomeArg!")
            }
          }
          withoutArg: node(id: "AddArg:1") {
            ... on AddArg {
              id
            }
          }
        }
      `
    )

    expect(result.data?.withArg.id).toEqual('SomeArg!')
    expect(result.data?.withoutArg.id).toEqual('AddArg:1')
  })

  it('can replace an abstract type field inherited from an interface', async () => {
    const result = await graphql(
      schema,
      `
        {
          node: __type(name: "Node") {
            fields {
              name
              description
              type {
                name
              }
            }
          }
          user: __type(name: "User") {
            fields {
              name
              description
              type {
                name
              }
            }
          }
        }
      `
    )
    expect(result.data?.node.fields.find((f: { name: string }) => f.name === 'subNode').type.name).toEqual(
      'Node'
    )
    expect(result.data?.user.fields.find((f: { name: string }) => f.name === 'subNode').type.name).toEqual(
      'User'
    )
  })

  describe('interfaces implementing interfaces', () => {
    let schemaTypes: string
    beforeAll(async () => {
      // Example schema courtesy of ivan explaining interfaces implementing interfaces to me
      ;({ schemaTypes } = await generateSchema.withArtifacts({
        types: [
          interfaceType({
            name: 'Pet',
            definition(t) {
              t.field('mother', { type: 'Pet' })
            },
          }),
          interfaceType({
            name: 'Equine',
            definition(t) {
              t.implements('Pet')
              t.modify('mother', { type: 'Pet' })
            },
          }),
          objectType({
            name: 'Horse',
            definition(t) {
              t.implements('Equine')
              t.modify('mother', { type: 'Equine' })
            },
          }),
          objectType({
            name: 'Donkey',
            definition(t) {
              t.implements('Equine')
              t.modify('mother', { type: 'Equine' })
            },
          }),
          objectType({
            name: 'Mule',
            definition(t) {
              t.implements('Equine')
              t.modify('mother', { type: 'Equine' })
            },
          }),
        ],
        outputs: false,
        features: {
          abstractTypeRuntimeChecks: false,
        },
      }))
    })

    it('should output a valid schema', () => {
      expect(schemaTypes).toMatchSnapshot()
    })
  })
})
