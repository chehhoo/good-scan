package com.cccmbiz.domain;

import jakarta.persistence.*;
import lombok.*;

@Entity
@NoArgsConstructor
@Getter
@Setter
@EqualsAndHashCode
public class RegisterProfile {
    @Id
    @Column(name = "id")            private Long id;
    @Column(name = "profile_id")    private Integer profileId;
    @Column(name = "register_id")   private Integer registerId;
}
