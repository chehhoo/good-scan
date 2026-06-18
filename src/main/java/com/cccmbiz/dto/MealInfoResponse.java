package com.cccmbiz.dto;

import com.cccmbiz.domain.Meal;
import lombok.Getter;
import lombok.Setter;

import java.util.List;

@Getter
@Setter
public class MealInfoResponse {
    private List<Meal> meals;
}
