# 05 SDNA: the type catalog

Every file carries a `DNA1` block with the definitions of every struct the writing Blender knew. Blender calls this the SDNA ("Struct DNA"). A reader uses it to find each member's offset, type and size. This is how files from any Blender version stay readable, including members the reader has never heard of.

## Encoding

All integers use the file's byte order. Strings are NUL-terminated. "Align to 4" means: skip zero bytes until the offset, counted from the start of the `DNA1` payload, is a multiple of 4.

| Part | Content |
|------|---------|
| `SDNA` | 4-byte tag |
| `NAME` | 4-byte tag, then int32 *n*, then *n* member declarators, e.g. `*next`, `loc[3]`, `(*func)()`; align to 4 |
| `TYPE` | 4-byte tag, then int32 *t*, then *t* type names, e.g. `char`, `float`, `ListBase`, `Object`; align to 4 |
| `TLEN` | 4-byte tag, then *t* int16 type sizes in bytes, parallel to `TYPE`; align to 4 |
| `STRC` | 4-byte tag, then int32 *s*, then *s* struct entries |

A struct entry is a sequence of int16 values:

| Field | Meaning |
|-------|---------|
| `type_index` | index into `TYPE`: the struct's own name and size |
| `members_num` | number of members |
| `members_num` × (`type_index`, `member_index`) | each member's type (index into `TYPE`) and declarator (index into `NAME`) |

A block's `SDNAnr` is an index into the `STRC` list. VERIFIED: struct 0 is named `raw_data` and has size 0 in both fixtures. Blender reserves index 0 for untyped byte buffers (`SDNA_RAW_DATA_STRUCT_INDEX` in `DNA_sdna_types.h`).

Why the alignment is relative to the payload: Blender reads the `DNA1` payload into its own buffer and aligns pointers inside that buffer (`pad_up_4` in `dna_genfile.cc`). The payload itself does not start at a 4-byte aligned file offset after a 17-byte header, so aligning by file offset would be wrong.

## Declarators

A declarator is the part of a C member declaration after the type. The bare member name is what remains after removing `*`, parentheses and the array suffix.

| Declarator | Name | Meaning | Size |
|------------|------|---------|------|
| `flag` | `flag` | one value of the member type | type size |
| `loc[3]` | `loc` | array of 3 | 3 × type size |
| `obmat[4][4]` | `obmat` | 4 × 4 array, row-major | 16 × type size |
| `*next` | `next` | pointer | pointer size |
| `**mat` | `mat` | pointer to a pointer array | pointer size |
| `*mtex[18]` | `mtex` | array of 18 pointers | 18 × pointer size |
| `(*func)()` | `func` | function pointer (stored, never meaningful in a file) | pointer size |

Pointer members take the pointer size whatever their type. The type of a pointer member can be one that `TYPE` lists with size 0, or an opaque runtime type such as `bke::MeshRuntime`. These are never stored inline.

## Layout rules

- Members follow each other with no implicit padding. Blender enforces this when it builds the catalog: shorts are 2-aligned, ints and floats 4-aligned, doubles, int64 and structs 8-aligned, with explicit `_pad` members to fill gaps. VERIFIED: in all 936 structs of the Blender 4.3 fixture and all 993 of the Blender 5.2 fixture, member sizes add up to the size in `TLEN`.
- The member offset is the sum of the sizes of the members before it.
- `char` and `uchar` are unsigned. A `char` array holds a NUL-terminated string in practice (names, paths).
- `long` and `ulong` are pointer sized.
- The pointer size equals half the size of `ListBase`, which is exactly two pointers. Blender computes it this way and so does the library.

## Primitive types

VERIFIED: both fixtures list the same basic types: `char`, `uchar`, `short`, `ushort`, `int`, `long`, `ulong`, `float`, `double`, `int64_t`, `uint64_t`, `int8_t`, `bool`, `void`. Every other type name is either a struct in `STRC` or an opaque type used only behind pointers.

## Stored names versus Blender's names

The catalog uses storage names, which can differ from names in Blender's current source and Python API. Blender maps them with `DNA_STRUCT_RENAME_MEMBER` entries in `dna_rename_defs.h`, for example `DNA_STRUCT_RENAME_MEMBER(Object, size, scale)`. VERIFIED: an object's scale reads as member `size` in both fixtures. A reader matches members by the stored name.

Blender 5.x stores C++ namespaced names for runtime types, for example `bke::MeshRuntime` (VERIFIED in `input/v52.blend`); 4.3 used `MeshRuntimeHandle`.

## Version changes are expected

The catalog makes struct layout a per-file property. Between the two fixtures, `Object` moved `parent` from offset 320 to 496 because `ID` grew. `Mesh` added an `attribute_storage` member in 5.x. A reader that relies on the catalog handles both without version checks. A reader that hard-codes offsets breaks.
