from app.services.extraction.normalize import get_child_base_label


def test_homeworks_parent_name_maps_to_homework_child_label():
    assert get_child_base_label("homeworks") == "Homework"


def test_unknown_parent_name_keeps_item_fallback():
    assert get_child_base_label("participation") == "Item"
