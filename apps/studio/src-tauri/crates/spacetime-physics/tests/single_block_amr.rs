use spacetime_physics::PhysicsError;
use spacetime_physics::amr::{
    AmrAdapterError, AmrBlockId, BlockCellIndex, RefinementLevel, SingleBlockAmrAdapter,
};
use spacetime_physics::{GridField3, UniformGrid3, vec3};

#[test]
fn root_block_matches_uniform_grid_indexing_and_field_access() {
    let grid = UniformGrid3::new(vec3::new(-1.0, 2.0, 0.5), vec3::splat(0.25), [3, 2, 2]);
    let adapter = SingleBlockAmrAdapter::try_new(grid).expect("uniform root block should adapt");
    let field = GridField3::from_fn(grid, |ijk, _| {
        (ijk[2] * grid.dimensions[1] + ijk[1]) * grid.dimensions[0] + ijk[0]
    })
    .expect("fixture field should be valid");

    let root = adapter.root_block();
    assert_eq!(root.id, AmrBlockId::ROOT);
    assert_eq!(root.level, RefinementLevel::ROOT);
    assert_eq!(root.parent, None);
    assert_eq!(root.grid, grid);

    for index in 0..grid.cell_count().expect("fixture grid should be valid") {
        let ijk = grid
            .ijk_for_index(index)
            .expect("fixture index should be valid");
        let cell = BlockCellIndex::new(AmrBlockId::ROOT, ijk);

        assert_eq!(
            adapter.linear_index(cell).unwrap(),
            grid.linear_index(ijk[0], ijk[1], ijk[2]).unwrap()
        );
        assert_eq!(adapter.cell_for_index(index).unwrap(), cell);
        assert_eq!(
            adapter.get(&field, cell).unwrap(),
            field.get(ijk[0], ijk[1], ijk[2]).unwrap()
        );
    }
}

#[test]
fn writes_update_the_uniform_field_and_invalid_topology_is_rejected() {
    let grid = UniformGrid3::new(vec3::ZERO, vec3::splat(1.0), [2, 2, 1]);
    let adapter = SingleBlockAmrAdapter::try_new(grid).unwrap();
    let mut field = GridField3::new(grid, 0_u32).unwrap();
    let cell = BlockCellIndex::new(AmrBlockId::ROOT, [1, 0, 0]);

    *adapter.get_mut(&mut field, cell).unwrap() = 17;
    assert_eq!(*field.get(1, 0, 0).unwrap(), 17);

    assert_eq!(
        adapter.linear_index(BlockCellIndex::new(AmrBlockId::new(1), [0, 0, 0])),
        Err(AmrAdapterError::UnsupportedBlock {
            requested: AmrBlockId::new(1),
        }),
    );

    let other_grid = UniformGrid3::new(vec3::ZERO, vec3::splat(2.0), [2, 2, 1]);
    let other_field = GridField3::new(other_grid, 0_u32).unwrap();
    assert_eq!(
        adapter.get(&other_field, cell),
        Err(AmrAdapterError::FieldGridMismatch),
    );

    let invalid_grid = UniformGrid3::new(vec3::ZERO, vec3::splat(1.0), [0, 1, 1]);
    assert_eq!(
        SingleBlockAmrAdapter::try_new(invalid_grid),
        Err(AmrAdapterError::Grid(PhysicsError::InvalidGrid)),
    );
}
